using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Manuscript.WebPane
{
    // A real child HWND owned by the helper, clipped by the Electron window. No reparented browser app.
    internal sealed class Surface : NativeWindow, IDisposable
    {
        private readonly IntPtr parent;
        internal Action FocusBrowser;
        internal Surface(IntPtr owner)
        {
            parent = owner;
            if (!IsWindow(parent)) throw new ArgumentException("The owning window is unavailable");
            CreateHandle(new CreateParams { Parent = parent, Caption = "Manuscript web page",
                Style = 0x40000000 | 0x04000000 | 0x02000000, X = 0, Y = 0, Width = 1, Height = 1 });
        }

        private double Scale { get { return Math.Max(96, GetDpiForWindow(parent)) / 96.0; } }
        internal Rectangle Place(IDictionary<string, object> bounds)
        {
            var scale = Scale;
            Rect client;
            GetClientRect(parent, out client);
            int x = Math.Min(client.Right, Math.Max(0, (int)Math.Round(Policy.Number(bounds, "x") * scale)));
            int y = Math.Min(client.Bottom, Math.Max(0, (int)Math.Round(Policy.Number(bounds, "y") * scale)));
            int width = Math.Min(Math.Max(0, client.Right - x), Math.Max(0, (int)Math.Round(Policy.Number(bounds, "width") * scale)));
            int height = Math.Min(Math.Max(0, client.Bottom - y), Math.Max(0, (int)Math.Round(Policy.Number(bounds, "height") * scale)));
            SetWindowPos(Handle, IntPtr.Zero, x, y, width, height, 0x0010);
            return new Rectangle(0, 0, Math.Max(1, width), Math.Max(1, height));
        }

        internal void Visible(bool visible)
        {
            if (Handle != IntPtr.Zero) ShowWindow(Handle, visible ? 4 : 0);
        }

        internal Dictionary<string, object> Bounds()
        {
            Rect rect;
            GetWindowRect(Handle, out rect);
            var point = new Point { X = rect.Left, Y = rect.Top };
            ScreenToClient(parent, ref point);
            var scale = Scale;
            return Policy.Object("x", point.X / scale, "y", point.Y / scale,
                "width", (rect.Right - rect.Left) / scale, "height", (rect.Bottom - rect.Top) / scale);
        }

        internal bool IsVisible { get { return Handle != IntPtr.Zero && IsWindowVisible(Handle); } }
        protected override void WndProc(ref Message message)
        {
            if (message.Msg == 7 && FocusBrowser != null) FocusBrowser();
            base.WndProc(ref message);
        }

        public void Dispose() { if (Handle != IntPtr.Zero) DestroyHandle(); }
        [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
        [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
        [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out Rect rectangle);
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rectangle);
        [DllImport("user32.dll")] private static extern bool ScreenToClient(IntPtr window, ref Point point);
        [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
    }
}
