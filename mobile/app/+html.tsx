import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* Social Preview Tags */}
        <title>FindMyFam - Keep Your Circle Safe</title>
        <meta name="description" content="Real-time family location tracking, safe zones, and emergency SOS alerts." />
        <meta property="og:title" content="FindMyFam - Live Location" />
        <meta property="og:description" content="Follow my live journey and keep our family circle safe." />
        <meta property="og:image" content="https://gps-demo.vercel.app/assets/images/icon.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FindMyFam - Live Location" />
        <meta name="twitter:description" content="Follow my live journey and keep our family circle safe." />
        <meta name="twitter:image" content="https://gps-demo.vercel.app/assets/images/icon.png" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;
