import Script from "next/script";

/** Runs before paint to apply saved theme and avoid flash / sluggish first paint. */
export function ThemeScript() {
  const script = `
(function() {
  try {
    var theme = localStorage.getItem('theme') || 'system';
    var isDark = theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    root.style.colorScheme = isDark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

  return (
    // This component is rendered directly from the App Router root layout.
    // The lint rule cannot see through the small component abstraction.
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script id="theme-script" strategy="beforeInteractive">
      {script}
    </Script>
  );
}
