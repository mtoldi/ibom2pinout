document.getElementById('fileElem').addEventListener('change', e => {
  uploadFile(e.target.files[0]);
});

function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  fetch('/upload', { method: 'POST', body: formData })
    .then(resp => resp.json())
    .then(data => {
      console.log("Received data:", data);
      if (data.status === 'ok') {
        const fab = Array.isArray(data.drawings?.fabrication?.F) ? data.drawings.fabrication.F : [];
        const sil = Array.isArray(data.drawings?.silkscreen?.F) ? data.drawings.silkscreen.F : [];
        const fps = Array.isArray(data.footprints) ? data.footprints : [];
        const edges = Array.isArray(data.edges) ? data.edges : [];
        renderSvgWithFootprints(fab, sil, fps, edges);

      } else {
        alert('Error from server: ' + data.message);
      }
    })
    .catch(err => alert('Upload failed: ' + err));
}



function renderSvgWithFootprints(fabrication, silkscreen, footprints, edges) {
  const svgNS = "http://www.w3.org/2000/svg";
  const old = document.getElementById('pcb-svg');
  if (old) old.remove();

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('id', 'pcb-svg');
  svg.style.width = '100%';
  svg.style.border = '1px solid #333';
  svg.style.background = '#f9f9f9';

  // Prikupljanje svih točaka za viewBox
  const all = [...fabrication, ...silkscreen, ...footprints, ...edges];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  all.forEach(item => {
    const points = [];

    if (item.start && item.end) points.push(item.start, item.end);
    if (item.center) points.push(item.center);
    if (item.pos) points.push(item.pos);
    if (item.bbox?.pos) points.push(item.bbox.pos);
    if (item.polygons?.[0]) points.push(...item.polygons[0]);
    if (item.radius) {
      const c = item.center || item.pos || item.start;
      if (c) {
        points.push([c[0] + item.radius, c[1] + item.radius]);
        points.push([c[0] - item.radius, c[1] - item.radius]);
      }
    }
    if (Array.isArray(item.pads)) {
      item.pads.forEach(pad => {
        if (pad.pos) points.push(pad.pos);
        if (pad.pos && pad.size) {
          points.push([
            pad.pos[0] + pad.size[0] / 2,
            pad.pos[1] + pad.size[1] / 2
          ]);
          points.push([
            pad.pos[0] - pad.size[0] / 2,
            pad.pos[1] - pad.size[1] / 2
          ]);
        }
      });
    }

    points.forEach(([x, y]) => {
      if (typeof x === 'number' && typeof y === 'number') {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });
  });

  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }

  const margin = (maxX - minX + maxY - minY) * 0.05;
  const viewMinX = minX - margin;
  const viewMinY = minY - margin;
  const viewWidth = (maxX - minX) + 2 * margin;
  const viewHeight = (maxY - minY) + 2 * margin;

  svg.setAttribute('viewBox', `${viewMinX} ${viewMinY} ${viewWidth} ${viewHeight}`);

  const group = document.createElementNS(svgNS, 'g');
  const shiftX = (viewMinX + viewWidth / 2) - (minX + maxX) / 2;
  const shiftY = (viewMinY + viewHeight / 2) - (minY + maxY) / 2;
  group.setAttribute('transform', `translate(${shiftX}, ${shiftY})`);

  //drawPaths(group, fabrication, svgNS, 'purple');
  drawPaths(group, silkscreen, svgNS, 'orange');
  drawFootprints(group, footprints, svgNS, 'green');
  drawEdges(group, edges, svgNS, 'purple');

  svg.appendChild(group);
  document.body.appendChild(svg);
}



function drawPaths(svg, paths, svgNS, strokeColor) {
  paths.forEach(item => {
    if (item.svgpath && item.svgpath.trim()) {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', item.svgpath);
      p.setAttribute('stroke', strokeColor);
      p.setAttribute('stroke-width', item.thickness || item.width || 0.15);
      p.setAttribute('fill', 'none');
      svg.appendChild(p);

    } else if (item.type === 'segment' && item.start && item.end) {
      createLine(svg, item.start, item.end, strokeColor, item.width);

    } else if (item.type === 'rect' && item.start && item.end) {
      createRect(svg, item.start, item.end, strokeColor, item.width);

    } else if (item.type === 'circle' && item.start) {
      createCircle(svg, item.start, item.radius, strokeColor, item.width);

    } else if (item.type === 'polygon' && item.polygons?.[0]) {
      const pts = item.polygons[0].map(pair => `${pair[0]},${pair[1]}`).join(' ');
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', pts);
      poly.setAttribute('stroke', strokeColor);
      poly.setAttribute('stroke-width', item.width || item.thickness || 0.15);
      poly.setAttribute('fill', 'none');
      svg.appendChild(poly);

    } else if ((item.ref || item.val) && Array.isArray(item.pos || item.center)) {
      const [x, y] = item.pos || item.center;
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', x);
      t.setAttribute('y', y);
      t.setAttribute('font-size', 2);
      t.setAttribute('fill', strokeColor);
      t.textContent = item.ref || item.val;
      svg.appendChild(t);
    }
  });
}

function drawFootprints(svg, fps, svgNS) {
  fps.forEach(fp => {
    const pos = Array.isArray(fp.bbox?.pos) ? fp.bbox.pos : null;
    if (!pos) return;
    const [x, y] = pos;

    if (Array.isArray(fp.pads)) {
      fp.pads.forEach(pad => {
        if (pad.type !== 'th') return; // samo kroz-rupe

        if (!Array.isArray(pad.pos) || !Array.isArray(pad.size)) return;
        const r = Math.max(pad.size[0], pad.size[1]) / 2;

        const c = document.createElementNS(svgNS, 'circle');
        c.setAttribute('cx', pad.pos[0]);
        c.setAttribute('cy', pad.pos[1]);
        c.setAttribute('r', r);
        c.setAttribute('stroke', 'purple');
        c.setAttribute('stroke-width', 0.1);
        c.setAttribute('fill', 'none');
        svg.appendChild(c);
      });
    }
  });
}


function createLine(svg, s, e, color, width = 0.15) {
  const l = document.createElementNS("http://www.w3.org/2000/svg",'line');
  l.setAttribute('x1', s[0]); l.setAttribute('y1', s[1]);
  l.setAttribute('x2', e[0]); l.setAttribute('y2', e[1]);
  l.setAttribute('stroke', color);
  l.setAttribute('stroke-width', width);
  svg.appendChild(l);
}

function createRect(svg, s, e, color, width = 0.15) {
  const r = document.createElementNS("http://www.w3.org/2000/svg",'rect');
  r.setAttribute('x', Math.min(s[0], e[0]));
  r.setAttribute('y', Math.min(s[1], e[1]));
  r.setAttribute('width', Math.abs(e[0]-s[0]));
  r.setAttribute('height', Math.abs(e[1]-s[1]));
  r.setAttribute('stroke', color);
  r.setAttribute('stroke-width', width);
  r.setAttribute('fill','none');
  svg.appendChild(r);
}

function createCircle(svg, center, radius=0.5, color, width=0.15) {
  const c = document.createElementNS("http://www.w3.org/2000/svg",'circle');
  c.setAttribute('cx', center[0]);
  c.setAttribute('cy', center[1]);
  c.setAttribute('r', radius);
  c.setAttribute('stroke', color);
  c.setAttribute('stroke-width', width);
  c.setAttribute('fill','none');
  svg.appendChild(c);
}

function drawEdges(svg, edges, svgNS) {
  edges.forEach(edge => {
    if (edge.type === 'segment' && edge.start && edge.end) {
      createLine(svg, edge.start, edge.end, '#800080', edge.width || 0.15); // ljubičasta

    } else if (edge.type === 'arc' && edge.start && typeof edge.radius === 'number') {
      const path = document.createElementNS(svgNS, 'path');

      const [sx, sy] = edge.start;
      const angleStart = (edge.startangle || 0) * Math.PI / 180;
      const angleEnd = (edge.endangle || 0) * Math.PI / 180;
      const cx = sx - edge.radius * Math.cos(angleStart);
      const cy = sy - edge.radius * Math.sin(angleStart);

      const ex = cx + edge.radius * Math.cos(angleEnd);
      const ey = cy + edge.radius * Math.sin(angleEnd);

      const largeArc = (Math.abs(edge.endangle - edge.startangle) > 180) ? 1 : 0;
      const sweep = (edge.endangle > edge.startangle) ? 1 : 0;

      const d = `M ${sx} ${sy} A ${edge.radius} ${edge.radius} 0 ${largeArc} ${sweep} ${ex} ${ey}`;
      path.setAttribute('d', d);
      path.setAttribute('stroke', '#800080'); // ljubičasta
      path.setAttribute('stroke-width', edge.width || 0.15);
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    } else {
      console.warn("Unhandled edge:", edge);
    }
  });
}
