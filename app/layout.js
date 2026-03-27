import "./globals.css";

export const metadata = {
  title: "RouteArt — AI-Powered Strava Art",
  description: "Generate GPS art routes on real streets",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
