// simulate.js - turn raw NASA data into a small summary, then draw it with three.js.
//
// Every dataset is converted into the SAME summary shape, so one renderer works for all:
//   {
//     title: "...",
//     unit:  "...",                               // what a bar's height means
//     stats: [ { label: "...", value: "..." } ],  // headline numbers
//     items: [ { label: "...", value: 123, color: "#hex" } ]  // one bar each
//   }

// ---------- 1) Summarize ----------

function summarizeNasaData(dataset, raw) {
  if (dataset === "neo")    return summarizeNeo(raw);
  if (dataset === "flares") return summarizeFlares(raw);
  return summarizeApod(raw);
}

function summarizeNeo(raw) {
  // raw.near_earth_objects looks like { "2026-09-20": [asteroid, ...], ... }
  var all = [];
  for (var date in raw.near_earth_objects) {
    all = all.concat(raw.near_earth_objects[date]);
  }

  var hazardous = 0;
  var closest = null;
  var items = all.map(function (a) {
    var d = a.estimated_diameter.meters;
    var km = parseFloat(a.close_approach_data[0].miss_distance.kilometers);
    if (a.is_potentially_hazardous_asteroid) hazardous++;
    if (closest === null || km < closest.km) closest = { name: a.name, km: km };
    return {
      label: a.name,
      value: Math.round((d.estimated_diameter_min + d.estimated_diameter_max) / 2),
      color: a.is_potentially_hazardous_asteroid ? "#e74c3c" : "#3498db"
    };
  });

  // Keep only the 30 biggest so the scene stays readable
  items.sort(function (x, y) { return y.value - x.value; });
  items = items.slice(0, 30);

  return {
    title: "Near-Earth Asteroids",
    unit: "avg diameter (m) - red = potentially hazardous",
    stats: [
      { label: "Asteroids", value: all.length },
      { label: "Hazardous", value: hazardous },
      { label: "Largest", value: items.length ? items[0].label + " (" + items[0].value + " m)" : "-" },
      { label: "Closest", value: closest ? closest.name + " (" + Math.round(closest.km).toLocaleString() + " km)" : "-" }
    ],
    items: items
  };
}

function summarizeFlares(raw) {
  // raw is an array of flares; classType looks like "M1.2" - the letter is the strength
  var classes = ["A", "B", "C", "M", "X"];
  var colors  = ["#95a5a6", "#3498db", "#2ecc71", "#f39c12", "#e74c3c"];
  var counts  = { A: 0, B: 0, C: 0, M: 0, X: 0 };
  var strongest = null;

  (raw || []).forEach(function (f) {
    var letter = (f.classType || "?").charAt(0);
    if (counts[letter] !== undefined) counts[letter]++;
    if (strongest === null || flareRank(f.classType) > flareRank(strongest.classType)) strongest = f;
  });

  return {
    title: "Solar Flares",
    unit: "number of flares per class (A weakest, X strongest)",
    stats: [
      { label: "Flares", value: (raw || []).length },
      { label: "Strongest", value: strongest ? strongest.classType + " at " + strongest.peakTime : "-" }
    ],
    items: classes.map(function (c, i) {
      return { label: "Class " + c, value: counts[c], color: colors[i] };
    })
  };
}

function flareRank(classType) {
  // "M1.2" -> 3 * 100 + 1.2, so X beats M beats C, etc.
  var order = "ABCMX".indexOf((classType || "A").charAt(0));
  return order * 100 + (parseFloat(classType.slice(1)) || 0);
}

function summarizeApod(raw) {
  var list = Array.isArray(raw) ? raw : [raw];
  var videos = 0;
  var items = list.map(function (p) {
    if (p.media_type === "video") videos++;
    return {
      label: p.date + ": " + p.title,
      value: (p.explanation || "").split(/\s+/).length,
      color: p.media_type === "video" ? "#9b59b6" : "#f1c40f"
    };
  });

  return {
    title: "Astronomy Picture of the Day",
    unit: "words in explanation - yellow = image, purple = video",
    stats: [
      { label: "Days", value: list.length },
      { label: "Images", value: list.length - videos },
      { label: "Videos", value: videos }
    ],
    items: items
  };
}

// ---------- 2) Draw with three.js ----------
// Bars stand in a circle and slowly spin. Hover a bar to see its label.

function renderSummary3D(summary, container, tooltip) {
  var width = container.clientWidth;
  var height = container.clientHeight;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1020");

  var camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(0, 14, 26);
  camera.lookAt(0, 3, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  var sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(10, 20, 10);
  scene.add(sun);

  // A flat disc as the floor
  var floor = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 12, 0.2, 64),
    new THREE.MeshStandardMaterial({ color: "#1c2541" })
  );
  scene.add(floor);

  // Everything that spins goes inside this group
  var group = new THREE.Group();
  scene.add(group);

  var max = Math.max.apply(null, summary.items.map(function (i) { return i.value; })) || 1;
  var n = summary.items.length;
  var radius = n > 1 ? 9 : 0;

  summary.items.forEach(function (item, i) {
    var h = Math.max(0.1, (item.value / max) * 10);   // tallest bar = 10 units
    var bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, h, 0.8),
      new THREE.MeshStandardMaterial({ color: item.color })
    );
    var angle = (i / n) * Math.PI * 2;
    bar.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius);
    bar.userData = item;   // remember which item this bar is, for hovering
    group.add(bar);
  });

  // Hover: use a raycaster to find the bar under the mouse
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var hovered = null;

  renderer.domElement.addEventListener("mousemove", function (e) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(group.children);
    hovered = hits.length ? hits[0].object : null;

    if (hovered) {
      tooltip.style.display = "block";
      tooltip.style.left = (e.clientX + 12) + "px";
      tooltip.style.top = (e.clientY + 12) + "px";
      tooltip.textContent = hovered.userData.label + " - " + hovered.userData.value;
    } else {
      tooltip.style.display = "none";
    }
  });

  function animate() {
    requestAnimationFrame(animate);
    if (!hovered) group.rotation.y += 0.003;   // pause spinning while hovering
    renderer.render(scene, camera);
  }
  animate();
}
