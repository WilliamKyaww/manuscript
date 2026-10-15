using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Manuscript.WebPane
{
    internal static class Program
    {
        internal static bool Debugging;
        [STAThread]
        private static void Main(string[] args)
        {
            string profile = null;
            int parentProcess = 0;
            for (int i = 0; i < args.Length; i += 2) {
                if (i + 1 >= args.Length) return;
                if (args[i] == "--profile") profile = args[i + 1];
                else if (args[i] == "--parent-process") {
                    if (!Int32.TryParse(args[i + 1], out parentProcess) || parentProcess <= 0) return;
                }
                else if (args[i] == "--diagnostics") {
                    if (args[i + 1] != "1") return;
                    Debugging = true;
                } else return;
            }
            if (String.IsNullOrEmpty(profile) || !Path.IsPathRooted(profile) || parentProcess <= 0) return;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (var parent = Process.GetProcessById(parentProcess)) {
                parent.EnableRaisingEvents = true;
                parent.Exited += (_, __) => Environment.Exit(0);
                using (var host = new Host(profile)) Application.Run(host);
            }
        }
    }

    internal sealed class Host : ApplicationContext
    {
        private readonly Form dispatcher = new Form();
        private readonly StreamWriter output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        private readonly Dictionary<string, BrowserPage> pages = new Dictionary<string, BrowserPage>();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 20 * 1024 * 1024, RecursionLimit = 20 };
        private CoreWebView2Environment environment;
        private CoreWebView2Controller sessionKeeper;
        private bool stopping;

        internal Host(string profile)
        {
            output.AutoFlush = true;
            // The dispatcher owns only a hidden message window; web surfaces are real children of Electron.
            var handle = dispatcher.Handle;
            dispatcher.BeginInvoke(new Action(async () => {
                try {
                    var options = new CoreWebView2EnvironmentOptions();
                    environment = await CoreWebView2Environment.CreateAsync(null, profile, options);
                    // Keep the browsing session alive when its last visible tab closes. Without a controller,
                    // WebView2 exits its browser process and drops session cookies between tab openings.
                    sessionKeeper = await environment.CreateCoreWebView2ControllerAsync(dispatcher.Handle);
                    sessionKeeper.IsVisible = false;
                    BrowserPage.Secure(sessionKeeper.CoreWebView2, null);
                    Send(Policy.Object("type", "ready", "available", true));
                    ReadCommands();
                } catch {
                    Send(Policy.Object("type", "ready", "available", false));
                    ExitThread();
                }
            }));
        }

        internal void Send(object value)
        {
            if (stopping) return;
            try { output.WriteLine(json.Serialize(value)); }
            catch (IOException) { ExitThread(); }
        }

        private async void ReadCommands()
        {
            using (var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false))) {
                try {
                    while (!stopping) {
                        var line = await Task.Run(() => input.ReadLine());
                        if (line == null || line.Length > 32768) break;
                        await Execute(line);
                    }
                } catch (IOException) { /* Parent exit closes the private pipe. */ }
            }
            ExitThread();
        }

        private async Task Execute(string line)
        {
            int requestId = 0;
            try {
                var request = json.DeserializeObject(line) as IDictionary<string, object>;
                if (request == null) throw new ArgumentException("Invalid request");
                requestId = Policy.Number(request, "requestId");
                if (requestId <= 0) throw new ArgumentException("Invalid request id");
                var operation = Policy.Text(request, "operation", 24);
                var key = Policy.Key(request);
                object result = null;
                BrowserPage page;
                if (operation == "open") {
                    if (!pages.ContainsKey(key)) {
                        var origin = Policy.Text(request, "origin", 2048);
                        var url = Policy.Text(request, "url", 8192);
                        long parent;
                        if (!Policy.WebUrl(url, origin) || !Int64.TryParse(Policy.Text(request, "parent", 24), out parent) || parent <= 0)
                            throw new ArgumentException("Invalid page");
                        page = new BrowserPage(key, new IntPtr(parent), origin, url, environment, Send, ExitThread);
                        pages.Add(key, page);
                        try { await page.Initialise(); }
                        catch { pages.Remove(key); page.Dispose(); throw; }
                    }
                    result = true;
                } else if (operation == "release") {
                    if (pages.TryGetValue(key, out page)) { pages.Remove(key); page.Dispose(); }
                } else {
                    if (!pages.TryGetValue(key, out page)) throw new ArgumentException("Unknown page");
                    if (operation == "place") {
                        object bounds;
                        if (!request.TryGetValue("bounds", out bounds) || (bounds != null && !(bounds is IDictionary<string, object>)))
                            throw new ArgumentException("Invalid bounds");
                        page.Place(bounds as IDictionary<string, object>);
                    } else if (operation == "command") {
                        var command = Policy.Text(request, "command", 16);
                        var url = command == "load" ? Policy.Text(request, "url", 8192) : null;
                        page.Command(command, url);
                    } else if (operation == "snapshot") result = await page.Snapshot();
                    else if (operation == "inspect") result = page.Inspect();
                    else if (operation == "debug" && Program.Debugging)
                        result = await page.Debug(Policy.Text(request, "method", 100), Policy.Text(request, "parameters", 24000));
                    else throw new ArgumentException("Unknown operation");
                }
                Send(Policy.Object("type", "result", "requestId", requestId, "ok", true, "value", result));
            } catch (ArgumentException) {
                if (requestId <= 0) ExitThread();
                else Send(Policy.Object("type", "result", "requestId", requestId, "ok", false, "error", "bad-request"));
            } catch {
                if (requestId <= 0) ExitThread();
                else Send(Policy.Object("type", "result", "requestId", requestId, "ok", false, "error", "failed"));
            }
        }

        protected override void ExitThreadCore()
        {
            if (stopping) return;
            stopping = true;
            foreach (var page in pages.Values) page.Dispose();
            pages.Clear();
            if (sessionKeeper != null) sessionKeeper.Close();
            dispatcher.Dispose();
            output.Dispose();
            base.ExitThreadCore();
        }
    }
}
