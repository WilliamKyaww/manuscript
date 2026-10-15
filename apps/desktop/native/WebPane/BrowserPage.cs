using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;

namespace Manuscript.WebPane
{
    internal sealed class BrowserPage : IDisposable
    {
        private readonly string key, origin;
        private readonly IntPtr owner;
        private readonly Action<object> send;
        private readonly Action browserExited;
        private readonly CoreWebView2Environment environment;
        private readonly Surface surface;
        private readonly List<Popup> popups = new List<Popup>();
        private readonly HashSet<ulong> cancelled = new HashSet<ulong>();
        private CoreWebView2Controller controller;
        private string url, committed;
        private object issue;
        private bool loading = true, disposed;
        private ulong navigation;

        internal BrowserPage(string id, IntPtr parent, string appOrigin, string address,
            CoreWebView2Environment engine, Action<object> emit, Action exited)
        {
            key = id; owner = parent; origin = appOrigin; url = committed = address;
            environment = engine; send = emit; browserExited = exited;
            surface = new Surface(owner);
        }

        internal async Task Initialise()
        {
            controller = await environment.CreateCoreWebView2ControllerAsync(surface.Handle);
            if (disposed) { controller.Close(); return; }
            controller.IsVisible = false;
            controller.Bounds = new Rectangle(0, 0, 1, 1);
            surface.FocusBrowser = () => controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);
            controller.GotFocus += (_, __) => State(true);
            controller.MoveFocusRequested += (_, args) => {
                args.Handled = true;
                send(Policy.Object("type", "focus-app", "key", key, "reverse", args.Reason == CoreWebView2MoveFocusReason.Previous));
            };
            var core = controller.CoreWebView2;
            Secure(core, origin);
            core.NavigationStarting += (_, args) => {
                if (!Policy.WebUrl(args.Uri, origin)) {
                    args.Cancel = true; cancelled.Add(args.NavigationId); loading = false; url = committed; State(false); return;
                }
                navigation = args.NavigationId; url = args.Uri; loading = true; issue = null; State(false);
            };
            core.SourceChanged += (_, args) => {
                if (Policy.WebUrl(core.Source, origin)) { url = core.Source; committed = url; }
                State(false);
            };
            core.NavigationCompleted += (_, args) => {
                if (cancelled.Remove(args.NavigationId) || args.NavigationId != navigation) return;
                loading = false;
                if (args.HttpStatusCode >= 400) issue = Policy.Object("kind", "http", "code", args.HttpStatusCode);
                else if (!args.IsSuccess && args.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
                    issue = Policy.Object("kind", "load", "code", -(int)args.WebErrorStatus);
                else issue = null;
                State(false);
            };
            core.DocumentTitleChanged += (_, __) => State(false);
            core.HistoryChanged += (_, __) => State(false);
            core.ProcessFailed += (_, args) => {
                loading = false; issue = Policy.Object("kind", "crash", "code", args.ExitCode); State(false);
                if (args.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) browserExited();
            };
            core.NewWindowRequested += OpenWindow;
            core.Navigate(url);
        }

        internal static void Secure(CoreWebView2 core, string origin)
        {
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.PermissionRequested += (_, args) => { args.State = CoreWebView2PermissionState.Deny; args.Handled = true; };
            // Leave normal web frames/srcdoc alone; the application origin never belongs in this session.
            core.FrameNavigationStarting += (_, args) => { if (Policy.IsAppUrl(args.Uri, origin)) args.Cancel = true; };
        }

        private async void OpenWindow(object sender, CoreWebView2NewWindowRequestedEventArgs args)
        {
            args.Handled = true;
            if (!Policy.WebUrl(args.Uri, origin)) return;
            if (!args.WindowFeatures.HasSize && !args.WindowFeatures.HasPosition) { controller.CoreWebView2.Navigate(args.Uri); return; }
            var deferral = args.GetDeferral();
            Popup popup = null;
            try {
                popup = new Popup(owner, origin, environment);
                popups.Add(popup);
                var core = await popup.Initialise();
                if (disposed) { popup.Close(); return; }
                args.NewWindow = core;
                popup.Show();
            } catch { if (popup != null) popup.Close(); }
            finally { deferral.Complete(); }
        }

        internal void Place(IDictionary<string, object> bounds)
        {
            if (disposed || controller == null) return;
            if (bounds == null) { controller.IsVisible = false; surface.Visible(false); return; }
            controller.Bounds = surface.Place(bounds);
            controller.NotifyParentWindowPositionChanged();
            bool visible = Policy.Number(bounds, "width") > 0 && Policy.Number(bounds, "height") > 0;
            controller.IsVisible = visible; surface.Visible(visible);
        }

        internal void Command(string command, string target)
        {
            var core = controller.CoreWebView2;
            if (command == "load") {
                if (!Policy.WebUrl(target, origin)) throw new ArgumentException("Invalid address");
                core.Navigate(target);
            } else if (command == "reload") core.Reload();
            else if (command == "stop") { core.Stop(); loading = false; State(false); }
            else if (command == "back") { if (core.CanGoBack) core.GoBack(); }
            else if (command == "forward") { if (core.CanGoForward) core.GoForward(); }
            else throw new ArgumentException("Invalid command");
        }

        internal async Task<string> Snapshot()
        {
            try {
                using (var stream = new MemoryStream()) {
                    await controller.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
                    if (stream.Length > 12 * 1024 * 1024) return null;
                    return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
                }
            } catch { return null; }
            finally { Place(null); }
        }

        internal object Inspect() { return Policy.Object("bounds", surface.Bounds(), "visible", surface.IsVisible && controller.IsVisible, "url", url); }

        internal Task<string> Debug(string method, string parameters)
        {
            if (!Program.Debugging) throw new ArgumentException("Debugging is disabled");
            return controller.CoreWebView2.CallDevToolsProtocolMethodAsync(method, parameters);
        }

        private void State(bool focused)
        {
            if (disposed || controller == null) return;
            var core = controller.CoreWebView2;
            send(Policy.Object("type", "state", "key", key, "url", url, "title", Policy.Clip(core.DocumentTitle),
                "loading", loading, "canGoBack", core.CanGoBack, "canGoForward", core.CanGoForward, "issue", issue, "focused", focused));
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            foreach (var popup in popups) popup.Close();
            if (controller != null) controller.Close();
            surface.Dispose();
        }
    }
}
