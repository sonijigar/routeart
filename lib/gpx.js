/**
 * Generate a GPX XML string from a route
 */
export function generateGPX(route) {
  const pts = route.coords
    .map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"><ele>0</ele></trkpt>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteArt"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>RouteArt: ${route.name} — Seattle SLU</name>
    <desc>${route.dist} running route starting at ${route.start}</desc>
  </metadata>
  <trk>
    <name>${route.name}</name>
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
  a.download = `routeart-${route.name.toLowerCase()}-slu.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
