// nasadata.js - fetch raw data from the NASA API and save it to localStorage.
//
// Usage: fetchNasaData(config).then(function (raw) { ... })
// config comes from app.html: { dataset, apiKey, storageKey, startDate, endDate, query }
//
// Most APIs are fetched straight from the browser. Four hosts don't send the
// CORS header browsers need, so they go through server.py's /proxy (see PROXY_DATASETS).

var PROXY_DATASETS = ["exoplanet", "osdr", "ssd-cneos", "techtransfer"];

function viaProxy(url) {
  return "/proxy?url=" + encodeURIComponent(url);
}

function buildNasaUrl(config) {
  var base = "https://api.nasa.gov";
  var range = "start_date=" + config.startDate + "&end_date=" + config.endDate;
  var key = "api_key=" + encodeURIComponent(config.apiKey);
  var q = encodeURIComponent(config.query || "");

  if (config.dataset === "neo") {
    return base + "/neo/rest/v1/feed?" + range + "&" + key;
  }
  if (config.dataset === "flares") {
    // DONKI uses startDate/endDate instead of start_date/end_date
    return base + "/DONKI/FLR?startDate=" + config.startDate +
           "&endDate=" + config.endDate + "&" + key;
  }
  if (config.dataset === "eonet") {
    // status=all includes events that have already closed
    return "https://eonet.gsfc.nasa.gov/api/v3/events?start=" + config.startDate +
           "&end=" + config.endDate + "&status=all";
  }
  if (config.dataset === "exoplanet") {
    // TAP takes an SQL-like query. "ps" = Planetary Systems table; default_flag=1
    // keeps one row per planet. rowupdate = when the archive last changed that row.
    var sql = "select pl_name,hostname,discoverymethod,disc_year,pl_rade,rowupdate from ps " +
              "where default_flag=1 and rowupdate >= '" + config.startDate +
              "' and rowupdate <= '" + config.endDate + "'";
    return "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=" +
           encodeURIComponent(sql) + "&format=json";
  }
  if (config.dataset === "insight") {
    // The InSight lander stopped reporting in 2020, so this always returns its last week.
    return base + "/insight_weather/?feedtype=json&ver=1.0&" + key;
  }
  if (config.dataset === "images") {
    // The library can only filter by year; data.html's summary trims to the exact dates.
    return "https://images-api.nasa.gov/search?media_type=image" +
           "&year_start=" + config.startDate.slice(0, 4) +
           "&year_end=" + config.endDate.slice(0, 4) + (q ? "&q=" + q : "");
  }
  if (config.dataset === "osdr") {
    // Newest 100 studies; the summary keeps the ones released inside the date range.
    return "https://osdr.nasa.gov/osdr/data/search?type=cgene&size=100" +
           "&sort=" + encodeURIComponent("Study Public Release Date") + "&order=DESC";
  }
  if (config.dataset === "ssc") {
    return "https://sscweb.gsfc.nasa.gov/WS/sscr/2/observatories";
  }
  if (config.dataset === "ssd-cneos") {
    // Close approaches to Earth within 0.05 au (the API default)
    return "https://ssd-api.jpl.nasa.gov/cad.api?date-min=" + config.startDate +
           "&date-max=" + config.endDate;
  }
  if (config.dataset === "techport") {
    return base + "/techport/api/projects?updatedSince=" + config.startDate + "&" + key;
  }
  if (config.dataset === "techtransfer") {
    // api.nasa.gov/techtransfer now just redirects here. It needs a search word.
    return "https://technology.nasa.gov/api/api/patent/" + (q || "space");
  }
  if (config.dataset === "tle") {
    return "https://tle.ivanstanojevic.me/api/tle/?page-size=100&sort=popularity&sort-dir=desc" +
           (q ? "&search=" + q : "");
  }
  return base + "/planetary/apod?" + range + "&" + key;   // "apod"
}

// fetch a URL and parse JSON, with a helpful message on failure
function getJson(url, options) {
  console.log("Fetching:", url);
  return fetch(url, options).then(function (response) {
    if (response.status === 404 && url.indexOf("/proxy?") === 0) {
      throw new Error("This dataset needs the proxy. Start the site with: python3 server.py");
    }
    if (!response.ok) {
      // 429 = too many requests (DEMO_KEY is limited to ~30/hour)
      throw new Error("NASA API returned HTTP " + response.status);
    }
    return response.json();
  });
}

// EPIC only answers one day at a time, so ask which days have photos,
// then fetch the most recent few inside the range.
function fetchEpic(config) {
  var epic = "https://epic.gsfc.nasa.gov/api/natural";
  return getJson(epic + "/available").then(function (days) {
    var wanted = days.filter(function (d) {
      return d >= config.startDate && d <= config.endDate;
    }).slice(-10);   // at most 10 requests
    return Promise.all(wanted.map(function (d) {
      return getJson(epic + "/date/" + d).then(function (photos) {
        return { date: d, photos: photos };
      });
    }));
  });
}

// GIBS and Trek are map-tile services: they return pictures, not JSON.
// We download a tile and measure it (file size + average brightness).
function measureTile(label, url) {
  console.log("Fetching tile:", url);
  return fetch(url)
    .then(function (response) {
      if (!response.ok) throw new Error("Tile server returned HTTP " + response.status);
      return response.blob();
    })
    .then(function (blob) {
      return createImageBitmap(blob).then(function (img) {
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var px = ctx.getImageData(0, 0, img.width, img.height).data;
        var sum = 0;
        for (var i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
        return { label: label, url: url, bytes: blob.size,
                 brightness: Math.round(sum / (px.length / 4)) };
      });
    });
}

function fetchGibs(config) {
  // One whole-Earth (western half) MODIS true-color tile per day, at most 30 days
  var tiles = [];
  var d = new Date(config.endDate + "T00:00:00");
  var start = new Date(config.startDate + "T00:00:00");
  while (d >= start && tiles.length < 30) {
    var ymd = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
              String(d.getDate()).padStart(2, "0");
    tiles.unshift(measureTile(ymd,
      "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/" +
      "MODIS_Terra_CorrectedReflectance_TrueColor/default/" + ymd + "/250m/0/0/0.jpg"));
    d.setDate(d.getDate() - 1);
  }
  return Promise.all(tiles);
}

function fetchTrek() {
  // The two top-level tiles of a global mosaic for each body (no dates here)
  var t = "https://trek.nasa.gov/tiles/";
  var tail = "/1.0.0/default/default028mm/0/0/";
  var layers = [
    ["Moon",  "Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02"],
    ["Mars",  "Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m"],
    ["Vesta", "Vesta/EQ/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd"]
  ];
  var jobs = [];
  layers.forEach(function (l) {
    jobs.push(measureTile(l[0] + " west", t + l[1] + tail + "0.jpg"));
    jobs.push(measureTile(l[0] + " east", t + l[1] + tail + "1.jpg"));
  });
  return Promise.all(jobs);
}

function fetchNasaData(config) {
  var request;
  if (config.dataset === "epic") {
    request = fetchEpic(config);
  } else if (config.dataset === "gibs") {
    request = fetchGibs(config);
  } else if (config.dataset === "trek") {
    request = fetchTrek();
  } else {
    var url = buildNasaUrl(config);
    if (PROXY_DATASETS.indexOf(config.dataset) >= 0) url = viaProxy(url);
    // SSC returns XML unless we ask for JSON
    var options = config.dataset === "ssc" ? { headers: { Accept: "application/json" } } : undefined;
    request = getJson(url, options);
  }

  return request.then(function (raw) {
    if (config.dataset === "eonet") {
      // A year of storm tracks is >10 MB - too big for localStorage (~5 MB).
      // Keep just the fields the summary uses, plus the latest position
      // (only for points - some events are huge polygons).
      raw.events = raw.events.map(function (e) {
        var last = e.geometry[e.geometry.length - 1] || {};
        return { id: e.id, title: e.title, closed: e.closed, categories: e.categories,
                 geometryCount: e.geometry.length, lastDate: last.date,
                 lastPoint: last.type === "Point" ? last.coordinates : null };
      });
    }
    // localStorage only stores strings, so stringify the whole response
    try {
      localStorage.setItem(config.storageKey, JSON.stringify(raw));
    } catch (e) {
      throw new Error("Response is too big for localStorage - try fewer days.");
    }
    return raw;
  });
}
