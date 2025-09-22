import React, { useRef, useEffect, useState, useCallback } from "react";

export default function App() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const tRef = useRef(0);
  const [running, setRunning] = useState(true);

  // Grid parameters (changeable from UI)
  const [rows, setRows] = useState(15);
  const [cols, setCols] = useState(20);
  const [cellSize, setCellSize] = useState(22); 
  const [gap, setGap] = useState(2); 
  const [speed, setSpeed] = useState(1.2); 
  const [waveWidth, setWaveWidth] = useState(3.5); 

  // Color cycle settings
  const [paletteIndex, setPaletteIndex] = useState(0);
  const palettes = [
    { name: "Green Glow", from: [30,200,30], to: [0,120,0] },
    { name: "Blue Glow", from: [30,120,200], to: [0,40,120] },
    { name: "Fire", from: [255,140,0], to: [120,10,0] },
    { name: "Purple", from: [180,80,220], to: [50,10,100] },
  ];

  // Cycle palette every N ms
  useEffect(() => {
    const id = setInterval(() => {
      setPaletteIndex((p) => (p + 1) % palettes.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Recording state
  const recorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = cols * (cellSize + gap) + gap;
    const height = rows * (cellSize + gap) + gap;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [cols, rows, cellSize, gap]);

  useEffect(() => resizeCanvas(), [resizeCanvas]);

  
  const waveIntensity = (j, t) => {
    
    const phase = t * speed;
    
    const center = (Math.sin(phase * 0.8) * 0.5 + 0.5) * (cols - 1);
    const dist = Math.abs(j - center);
    
    const intensity = Math.max(0, 1 - Math.pow(dist / waveWidth, 2));
    
    return Math.max(0, Math.min(1, intensity * (0.6 + 0.4 * Math.sin(phase * 2 + j))))
  };

  // convert palette and intensity -> rgba string
  const colorFor = (intensity) => {
    const p = palettes[paletteIndex];
    const r = Math.round(p.from[0] * intensity + p.to[0] * (1 - intensity));
    const g = Math.round(p.from[1] * intensity + p.to[1] * (1 - intensity));
    const b = Math.round(p.from[2] * intensity + p.to[2] * (1 - intensity));
    
    const a = Math.min(1, 0.25 + Math.sqrt(intensity) * 0.85);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  // main draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let lastTime = performance.now();

    function draw(now) {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      if (!running) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      tRef.current += dt;
      // clear background dark
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      
      const widthPx = cols * (cellSize + gap) + gap;
      const heightPx = rows * (cellSize + gap) + gap;
      // subtle grid overlay
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#000";
      // draw each empty cell as dark square with thin border
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const x = gap + j * (cellSize + gap);
          const y = gap + i * (cellSize + gap);
          ctx.fillStyle = "#0c0c0c";
          ctx.fillRect(x, y, cellSize, cellSize);
          ctx.strokeStyle = "rgba(0,0,0,0.5)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
        }
      }
      ctx.restore();

      // draw wave by columns; columns closer to wave get bright color
      for (let j = 0; j < cols; j++) {
        const colIntensity = waveIntensity(j, tRef.current * 2);
        for (let i = 0; i < rows; i++) {
          
          const rowFactor = 1 - Math.abs((i - (rows - 1) / 2) / ((rows - 1) / 2));
          const intensity = Math.max(0, Math.min(1, colIntensity * (0.5 + 0.5 * rowFactor)));
          const color = colorFor(intensity);
          const x = gap + j * (cellSize + gap);
          const y = gap + i * (cellSize + gap);
          
          if (intensity > 0.02) {
            // draw glow behind cell
            if (intensity > 0.15) {
              ctx.save();
              ctx.shadowBlur = Math.max(6, intensity * 18);
              ctx.shadowColor = color;
              ctx.fillStyle = color;
              ctx.fillRect(x, y, cellSize, cellSize);
              ctx.restore();
            } else {
              ctx.fillStyle = color;
              ctx.fillRect(x, y, cellSize, cellSize);
            }
            // thin border to keep grid look
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rows, cols, cellSize, gap, running, paletteIndex, palettes, speed, waveWidth]);

  // Recording handlers
  const startRecording = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRecordedUrl(null);
    // capture stream
    const stream = canvas.captureStream(60); 
    const options = { mimeType: "video/webm;codecs=vp9" };
    let chunks = [];
    try {
      const recorder = new MediaRecorder(stream, options);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        chunks = [];
      };
      recorder.start();
      setRecording(true);
    } catch (err) {
      alert("Recording not supported in this browser: " + err.message);
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  // download recorded file
  const downloadRecording = () => {
    if (!recordedUrl) return;
    const a = document.createElement("a");
    a.href = recordedUrl;
    a.download = `wave-grid-${rows}x${cols}.webm`;
    a.click();
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto", padding: 18, display: "flex", gap: 24, alignItems: "flex-start", background: "#111", minHeight: "100vh", color: "#eaeaea" }}>
      <div style={{ background: "#0b0b0b", padding: 16, borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.7)" }}>
        <canvas ref={canvasRef} style={{ display: "block", background: "#0a0a0a" }} />
      </div>

      <div style={{ width: 360 }}>
       
        <p style={{ color: "#bbb" }}>Pure React implementation. Change controls below and press Record to download a .webm video of the canvas animation.</p>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <label>Rows: <input type="number" value={rows} min={4} max={80} onChange={(e) => setRows(Number(e.target.value))} /></label>
          <label>Cols: <input type="number" value={cols} min={4} max={120} onChange={(e) => setCols(Number(e.target.value))} /></label>
          <label>Cell size (px): <input type="range" min={8} max={40} value={cellSize} onChange={(e) => setCellSize(Number(e.target.value))} /></label>
          <label>Gap (px): <input type="range" min={0} max={6} value={gap} onChange={(e) => setGap(Number(e.target.value))} /></label>
          <label>Speed: <input type="range" min={0.2} max={3} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
          <label>Wave width: <input type="range" min={1} max={8} step={0.1} value={waveWidth} onChange={(e) => setWaveWidth(Number(e.target.value))} /></label>

          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={() => setRunning((r) => !r)} style={{ padding: "8px 12px", borderRadius: 6 }}>{running ? "Pause" : "Start"}</button>
            {!recording ? (
              <button onClick={startRecording} style={{ padding: "8px 12px", borderRadius: 6 }}>Start Recording</button>
            ) : (
              <button onClick={stopRecording} style={{ padding: "8px 12px", borderRadius: 6, background: "#b33" }}>Stop Recording</button>
            )}
            {recordedUrl && <button onClick={downloadRecording} style={{ padding: "8px 12px", borderRadius: 6 }}>Download Video</button>}
          </div>

          <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "#0a0a0a" }}>
            <strong>Palette:</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              {palettes.map((p, idx) => (
                <button key={p.name} onClick={() => setPaletteIndex(idx)} style={{ padding: 6, borderRadius: 6, border: paletteIndex === idx ? "2px solid #fff" : "1px solid rgba(255,255,255,0.06)", background: "transparent" }}>{p.name}</button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, color: "#aaa", fontSize: 13 }}>
            <p><strong>Tips:</strong></p>
            <ul>
              <li>Set grid to 15x20 to match the assignment preview.</li>
              <li>Use Start Recording then Stop Recording to save a webm file.</li>
              <li>Recording uses browser MediaRecorder — Chrome/Edge recommended.</li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}