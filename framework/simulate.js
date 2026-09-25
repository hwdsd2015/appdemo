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

function summarizeNasaData(dataset, raw, config) {
  if (dataset === "neo")          return summarizeNeo(raw);
  if (dataset === "flares")       return summarizeFlares(raw);
  if (dataset === "eonet")        return summarizeEonet(raw);
  if (dataset === "epic")         return summarizeEpic(raw);
  if (dataset === "exoplanet")    return summarizeExoplanet(raw);
  if (dataset === "gibs")         return summarizeTiles(raw, "GIBS: MODIS Earth tile per day");
  if (dataset === "insight")      return summarizeInsight(raw);
  if (dataset === "images")       return summarizeImages(raw, config);
  if (dataset === "osdr")         return summarizeOsdr(raw, config);
  if (dataset === "ssc")          return summarizeSsc(raw, config);
  if (dataset === "ssd-cneos")    return summarizeCloseApproaches(raw);
  if (dataset === "techport")     return summarizeTechport(raw, config);
  if (dataset === "techtransfer") return summarizeTechTransfer(raw);
  if (dataset === "tle")          return summarizeTle(raw);
  if (dataset === "trek")         return summarizeTiles(raw, "Trek: global map tiles");
  return summarizeApod(raw);
}

// Colors for "one bar per category" charts
var PALETTE = ["#3498db", "#e74c3c", "#2ecc71", "#f39c12", "#9b59b6",
               "#1abc9c", "#e67e22", "#f1c40f", "#95a5a6", "#34495e"];

// { "a": 3, "b": 5 } -> bars, biggest first
function countsToItems(counts, limit) {
  var items = Object.keys(counts).map(function (k) { return { label: k, value: counts[k] }; });
  items.sort(function (x, y) { return y.value - x.value; });
  return items.slice(0, limit || 30).map(function (item, i) {
    item.color = PALETTE[i % PALETTE.length];
    return item;
  });
}

function countBy(list, keyFn) {
  var counts = {};
  list.forEach(function (x) {
    var k = keyFn(x) || "Unknown";
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

function inRange(ymd, config) {
  return ymd >= config.startDate && ymd <= config.endDate;
}

function summarizeEonet(raw) {
  var events = raw.events || [];
  var open = events.filter(function (e) { return !e.closed; }).length;
  return {
    title: "Natural Events (EONET)",
    unit: "number of events per category",
    stats: [
      { label: "Events", value: events.length },
      { label: "Still open", value: open },
      { label: "Closed", value: events.length - open }
    ],
    items: countsToItems(countBy(events, function (e) { return e.categories[0].title; }))
  };
}

function summarizeEpic(raw) {
  var total = 0;
  var items = raw.map(function (day) {
    total += day.photos.length;
    return { label: day.date, value: day.photos.length, color: "#3498db" };
  });
  return {
    title: "Earth Photos from DSCOVR (EPIC)",
    unit: "photos of the whole Earth taken that day",
    stats: [
      { label: "Days with photos", value: raw.length },
      { label: "Photos", value: total },
      { label: "Latest", value: raw.length ? raw[raw.length - 1].date : "-" }
    ],
    items: items
  };
}

function summarizeExoplanet(raw) {
  var list = raw || [];
  var withRadius = list.filter(function (p) { return p.pl_rade; });
  withRadius.sort(function (a, b) { return b.pl_rade - a.pl_rade; });
  var methods = countBy(list, function (p) { return p.discoverymethod; });
  var methodNames = Object.keys(methods);
  return {
    title: "Exoplanets Updated in the Archive",
    unit: "planet radius (Earth = 1), color = discovery method",
    stats: [
      { label: "Planets updated", value: list.length },
      { label: "Methods", value: methodNames.join(", ") || "-" },
      { label: "Biggest", value: withRadius.length ? withRadius[0].pl_name + " (" + withRadius[0].pl_rade + " x Earth)" : "-" }
    ],
    items: withRadius.slice(0, 30).map(function (p) {
      return {
        label: p.pl_name + " (" + p.discoverymethod + ", " + p.disc_year + ")",
        value: p.pl_rade,
        color: PALETTE[methodNames.indexOf(p.discoverymethod) % PALETTE.length]
      };
    })
  };
}

function summarizeTiles(raw, title) {
  // raw = [ { label, url, bytes, brightness } ] from measureTile() in nasadata.js
  var brightest = null;
  raw.forEach(function (t) { if (!brightest || t.brightness > brightest.brightness) brightest = t; });
  return {
    title: title,
    unit: "average tile brightness (0-255) - brighter often means more cloud/ice",
    stats: [
      { label: "Tiles", value: raw.length },
      { label: "Downloaded", value: Math.round(raw.reduce(function (s, t) { return s + t.bytes; }, 0) / 1024) + " KB" },
      { label: "Brightest", value: brightest ? brightest.label + " (" + brightest.brightness + ")" : "-" }
    ],
    items: raw.map(function (t) {
      var g = t.brightness.toString(16).padStart(2, "0");
      return { label: t.label, value: t.brightness, color: "#" + g + g + g };
    })
  };
}

function summarizeInsight(raw) {
  var sols = raw.sol_keys || [];
  var withTemp = sols.filter(function (s) { return raw[s] && raw[s].AT; });
  return {
    title: "Mars Weather at InSight (mission ended 2020)",
    unit: "temperature range in C (max - min) per sol (Mars day)",
    stats: [
      { label: "Sols", value: sols.length },
      { label: "Dates", value: sols.length ? raw[sols[0]].First_UTC.slice(0, 10) + " to " + raw[sols[sols.length - 1]].Last_UTC.slice(0, 10) : "-" },
      { label: "Northern season", value: sols.length ? raw[sols[0]].Northern_season : "-" }
    ],
    items: withTemp.map(function (s) {
      var t = raw[s].AT;
      return {
        label: "Sol " + s + ": low " + Math.round(t.mn) + " C, avg " + Math.round(t.av) + " C, high " + Math.round(t.mx) + " C",
        value: Math.round(t.mx - t.mn),
        color: "#e67e22"
      };
    })
  };
}

function summarizeImages(raw, config) {
  var all = raw.collection.items.map(function (it) { return it.data[0]; });
  var inDates = all.filter(function (d) { return inRange(d.date_created.slice(0, 10), config); });
  return {
    title: "NASA Image Library",
    // The API can't sort or filter by exact date, so chart the whole first page
    unit: "images per NASA center (first 100 results for " + config.startDate.slice(0, 4) +
          "-" + config.endDate.slice(0, 4) + ")",
    stats: [
      { label: "Total matches (by year)", value: raw.collection.metadata.total_hits },
      { label: "In first page", value: all.length },
      { label: "Of those, inside your dates", value: inDates.length }
    ],
    items: countsToItems(countBy(all, function (d) { return d.center; }))
  };
}

function summarizeOsdr(raw, config) {
  var studies = raw.hits.hits.map(function (h) { return h._source; }).filter(function (s) {
    var released = new Date(s["Study Public Release Date"] * 1000).toISOString().slice(0, 10);
    return inRange(released, config);
  });
  return {
    title: "Space Biology Studies Released (OSDR)",
    unit: "studies per organism (from the newest 100 releases)",
    stats: [
      { label: "Studies in range", value: studies.length },
      { label: "All studies", value: raw.hits.total },
      { label: "Newest", value: studies.length ? studies[0].Accession + ": " + studies[0]["Study Title"] : "-" }
    ],
    items: countsToItems(countBy(studies, function (s) { return s.organism; }))
  };
}

function summarizeSsc(raw, config) {
  // SSC's JSON wraps every object as [javaTypeName, value], so unwrap as we go
  var list = raw[1].Observatory[1].map(function (o) { return o[1]; });
  var active = list.filter(function (o) {
    return o.StartTime[1].slice(0, 10) <= config.endDate && o.EndTime[1].slice(0, 10) >= config.startDate;
  });
  var items = active.map(function (o) {
    var years = (new Date(config.endDate) - new Date(o.StartTime[1])) / (365.25 * 864e5);
    return { label: o.Name + " (since " + o.StartTime[1].slice(0, 4) + ")", value: Math.round(years * 10) / 10,
             color: years > 20 ? "#e67e22" : "#3498db" };
  });
  items.sort(function (a, b) { return b.value - a.value; });
  return {
    title: "Observatories Tracked by SSC",
    unit: "years of tracking data - orange = over 20 years (30 oldest shown)",
    stats: [
      { label: "Observatories known", value: list.length },
      { label: "With data in range", value: active.length },
      { label: "Oldest", value: items.length ? items[0].label : "-" }
    ],
    items: items.slice(0, 30)
  };
}

function summarizeCloseApproaches(raw) {
  // raw.fields names the columns of each row in raw.data
  var col = {};
  raw.fields.forEach(function (f, i) { col[f] = i; });
  var LD = 0.00257;   // 1 lunar distance in au
  var rows = (raw.data || []).map(function (r) {
    return { name: r[col.des], date: r[col.cd], ld: parseFloat(r[col.dist]) / LD, speed: parseFloat(r[col.v_rel]) };
  });
  rows.sort(function (a, b) { return a.ld - b.ld; });
  return {
    title: "Asteroid Close Approaches (JPL SSD/CNEOS)",
    unit: "closeness = 20 minus distance in lunar distances - red = closer than the Moon",
    stats: [
      { label: "Approaches", value: rows.length },
      { label: "Inside Moon's orbit", value: rows.filter(function (r) { return r.ld < 1; }).length },
      { label: "Closest", value: rows.length ? rows[0].name + " (" + rows[0].ld.toFixed(2) + " LD on " + rows[0].date + ")" : "-" }
    ],
    items: rows.slice(0, 30).map(function (r) {
      return {
        label: r.name + " - " + r.ld.toFixed(2) + " LD, " + r.speed.toFixed(1) + " km/s, " + r.date,
        value: Math.max(0.1, Math.round((20 - r.ld) * 10) / 10),   // taller = closer
        color: r.ld < 1 ? "#e74c3c" : "#3498db"
      };
    })
  };
}

function summarizeTechport(raw, config) {
  // lastUpdated looks like "2026-9-3", so pad it to "2026-09-03"
  var projects = (raw.projects || []).map(function (p) {
    var d = p.lastUpdated.split("-");
    return d[0] + "-" + d[1].padStart(2, "0") + "-" + d[2].padStart(2, "0");
  }).filter(function (ymd) { return inRange(ymd, config); });
  var counts = countBy(projects, function (ymd) { return ymd; });
  return {
    title: "NASA Technology Projects Updated (Techport)",
    unit: "projects updated per day",
    stats: [
      { label: "Projects updated", value: projects.length },
      { label: "Days with updates", value: Object.keys(counts).length }
    ],
    items: Object.keys(counts).sort().map(function (d) {
      return { label: d, value: counts[d], color: "#1abc9c" };
    })
  };
}

function summarizeTechTransfer(raw) {
  // Each result is an array: [id, case number, title, description, ..., 5 = category, ..., 9 = center]
  var results = raw.results || [];
  var centers = countBy(results, function (r) { return r[9]; });
  return {
    title: "NASA Patents (TechTransfer)",
    unit: "patents per category",
    stats: [
      { label: "Patents found", value: raw.total },
      { label: "Centers", value: Object.keys(centers).join(", ") || "-" }
    ],
    items: countsToItems(countBy(results, function (r) { return r[5]; }))
  };
}

function summarizeTle(raw) {
  // Line 2, columns 53-63 = mean motion (orbits per day). Period = 1440 / that, in minutes.
  var sats = raw.member.map(function (s) {
    var motion = parseFloat(s.line2.substring(52, 63));
    return { name: s.name, minutes: Math.round(1440 / motion) };
  });
  var leo = sats.filter(function (s) { return s.minutes < 128; }).length;
  var geo = sats.filter(function (s) { return s.minutes > 1400 && s.minutes < 1480; }).length;
  return {
    title: "Popular Satellites (TLE)",
    unit: "minutes per orbit - blue = low Earth orbit, orange = higher (30 most popular shown)",
    stats: [
      { label: "Satellites in catalog", value: raw.totalItems },
      { label: "Low Earth orbit", value: leo + " of " + sats.length },
      { label: "Geostationary", value: geo }
    ],
    items: sats.slice(0, 30).map(function (s) {
      return { label: s.name + " (" + s.minutes + " min)", value: s.minutes,
               color: s.minutes < 128 ? "#3498db" : "#e67e22" };
    })
  };
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
