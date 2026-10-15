using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Manuscript.WebPane
{
    internal static class Policy
    {
        internal static string Text(IDictionary<string, object> value, string key, int maximum)
        {
            object item;
            if (!value.TryGetValue(key, out item) || !(item is string) || ((string)item).Length > maximum)
                throw new ArgumentException("Invalid field");
            return (string)item;
        }

        internal static int Number(IDictionary<string, object> value, string key)
        {
            object item;
            if (!value.TryGetValue(key, out item) || !(item is int)) throw new ArgumentException("Invalid number");
            return (int)item;
        }

        internal static string Key(IDictionary<string, object> value)
        {
            var key = Text(value, "key", 80);
            if (!Regex.IsMatch(key, "^[A-Za-z0-9_-]{1,80}$")) throw new ArgumentException("Invalid key");
            return key;
        }

        internal static bool IsAppUrl(string value, string origin)
        {
            Uri uri;
            return origin != null && Uri.TryCreate(value, UriKind.Absolute, out uri) &&
                String.Equals(uri.GetLeftPart(UriPartial.Authority), origin, StringComparison.OrdinalIgnoreCase);
        }

        internal static bool WebUrl(string value, string origin)
        {
            Uri uri;
            return value != null && value.Length <= 8192 && Uri.TryCreate(value, UriKind.Absolute, out uri) &&
                (uri.Scheme == "https" || uri.Scheme == "http") && uri.UserInfo.Length == 0 &&
                uri.Host.Length > 0 && !IsAppUrl(value, origin);
        }

        internal static string Clip(string value) { return value == null ? "" : value.Substring(0, Math.Min(value.Length, 512)); }

        internal static Dictionary<string, object> Object(params object[] fields)
        {
            var value = new Dictionary<string, object>();
            for (int i = 0; i < fields.Length; i += 2) value.Add((string)fields[i], fields[i + 1]);
            return value;
        }
    }
}
