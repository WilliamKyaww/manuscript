using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Manuscript.WebPane
{
    // A website-requested popup shares only the web profile, never Manuscript's preload or session.
    internal sealed class Popup : Form
    {
        private readonly string origin;
        private readonly IntPtr owner;
        private readonly CoreWebView2Environment environment;
        private CoreWebView2Controller controller;
        internal Popup(IntPtr parent, string appOrigin, CoreWebView2Environment engine)
        {
            owner = parent; origin = appOrigin; environment = engine;
            Text = "Web page"; Width = 520; Height = 680; ShowInTaskbar = false;
            Resize += (_, __) => { if (controller != null) controller.Bounds = new Rectangle(Point.Empty, ClientSize); };
            FormClosed += (_, __) => { if (controller != null) controller.Close(); };
        }
        protected override CreateParams CreateParams
        {
            get { var parameters = base.CreateParams; parameters.Parent = owner; return parameters; }
        }
        internal async Task<CoreWebView2> Initialise()
        {
            controller = await environment.CreateCoreWebView2ControllerAsync(Handle);
            controller.Bounds = new Rectangle(Point.Empty, ClientSize);
            var core = controller.CoreWebView2;
            BrowserPage.Secure(core, origin);
            core.NavigationStarting += (_, args) => { if (!Policy.WebUrl(args.Uri, origin)) args.Cancel = true; };
            core.NewWindowRequested += (_, args) => {
                args.Handled = true;
                if (Policy.WebUrl(args.Uri, origin)) core.Navigate(args.Uri);
            };
            core.DocumentTitleChanged += (_, __) => {
                Uri uri;
                Text = Uri.TryCreate(core.Source, UriKind.Absolute, out uri)
                    ? uri.Host + " — " + Policy.Clip(core.DocumentTitle) : "Web page";
            };
            core.WindowCloseRequested += (_, __) => Close();
            return core;
        }
    }
}
