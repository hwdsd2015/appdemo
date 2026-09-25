// nasadata.js - fetch raw data from the NASA API and save it to localStorage.
//
// Usage: fetchNasaData(config).then(function (raw) { ... })
// config comes from app.html: { dataset, apiKey, storageKey, startDate, endDate }

function buildNasaUrl(config) {
  var base = "https://api.nasa.gov";
  var range = "start_date=" + config.startDate + "&end_date=" + config.endDate;
  var key = "api_key=" + encodeURIComponent(config.apiKey);

  if (config.dataset === "neo") {
    return base + "/neo/rest/v1/feed?" + range + "&" + key;
  }
  if (config.dataset === "flares") {
    // DONKI uses startDate/endDate instead of start_date/end_date
    return base + "/DONKI/FLR?startDate=" + config.startDate +
           "&endDate=" + config.endDate + "&" + key;
  }
  return base + "/planetary/apod?" + range + "&" + key;   // "apod"
}

function fetchNasaData(config) {
  var url = buildNasaUrl(config);
  console.log("Fetching:", url);

  return fetch(url)
    .then(function (response) {
      if (!response.ok) {
        // 429 = too many requests (DEMO_KEY is limited to ~30/hour)
        throw new Error("NASA API returned HTTP " + response.status);
      }
      return response.json();
    })
    .then(function (raw) {
      // localStorage only stores strings, so stringify the whole response
      localStorage.setItem(config.storageKey, JSON.stringify(raw));
      return raw;
    });
}
