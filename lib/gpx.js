/**
 * Generate a GPX XML string from a route
 */
export function generateGPX(route) {
  const pts = route.coords
    .map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"><ele>0</ele></trkpt>`)
    .join("\n");
  const activity = { run: "running", walk: "walking", ride: "cycling" }[route.activity] || "running";

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteArt"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>RouteArt: ${escapeXml(route.name)} — Seattle</name>
    <desc>${escapeXml(route.dist)} ${activity} loop near ${escapeXml(route.start)}</desc>
  </metadata>
  <trk>
    <name>${escapeXml(route.name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

export function downloadGPX(route) {
  const gpx = generateGPX(route);
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `routeart-${route.name.toLowerCase()}-${route.activity || "run"}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}
