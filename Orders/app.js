

var appInput = {
  contract_number: "CTR-0000399",   
  product_name: "Spot Price",      
  commodity: "Power",               
  country: "Denmark"                
};


function getMonthKey(row) {
  return row.validFrom || row.validfrom || row.validfromdate || null;
}

function toNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  var n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function safeDiv(num, den) {
  if (num === null || num === undefined) return null;
  if (den === null || den === undefined || den === 0) return null;
  return num / den;
}

function safeParseJson(val) {
  if (typeof val !== "string") return val;
  try { return JSON.parse(val); } catch (e) { return null; }
}


function getValidityDate() {
  var today = new Date();
  var targetYear = today.getFullYear() + 5;

  // Month is 0-based: 11 = December; Day = 31
  var validityDate = new Date(targetYear, 11, 31);

  // Format as YYYY-MM-DD
  var year = validityDate.getFullYear();
  var month = (validityDate.getMonth() + 1);
  var day = validityDate.getDate();

  // zero-pad month/day
  var mm = month < 10 ? "0" + month : "" + month;
  var dd = day < 10 ? "0" + day : "" + day;

  return year + "-" + mm + "-" + dd;
}


function calculateBasePeak(edmJsonStrOrObj) {
  var data = safeParseJson(edmJsonStrOrObj);
  if (!data) {
    return { base_DK1: null, base_DK2: null, peak_DK1: null, peak_DK2: null, error: "Invalid JSON input" };
  }

  var rows = (data && data.variables) ? data.variables : data;
  if (!rows || !rows.length) {
    return { base_DK1: null, base_DK2: null, peak_DK1: null, peak_DK2: null };
  }

  var byMonth = {};
  var hasBase1 = false, hasBase2 = false, hasPeak1 = false, hasPeak2 = false;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;

    var monthKey = getMonthKey(row);
    if (!monthKey) continue;

    if (!byMonth[monthKey]) byMonth[monthKey] = {};

    var name = row.variableName;
    var valueNum = toNumber(row.value);
    byMonth[monthKey][name] = valueNum;

    if (name === "FCT_BASE_DK1") hasBase1 = true;
    else if (name === "FCT_BASE_DK2") hasBase2 = true;
    else if (name === "FCT_PEAK_DK1") hasPeak1 = true;
    else if (name === "FCT_PEAK_DK2") hasPeak2 = true;
  }

  var result = {
    base_DK1: hasBase1 ? {} : null,
    base_DK2: hasBase2 ? {} : null,
    peak_DK1: hasPeak1 ? {} : null,
    peak_DK2: hasPeak2 ? {} : null
  };

  if (!hasBase1 && !hasBase2 && !hasPeak1 && !hasPeak2) return result;

  for (var monthKey2 in byMonth) {
    if (!byMonth.hasOwnProperty(monthKey2)) continue;

    var m = byMonth[monthKey2];

    var FCT_BASE_DK1 = m.FCT_BASE_DK1;
    var FCT_BASE_DK2 = m.FCT_BASE_DK2;
    var FCT_PEAK_DK1 = m.FCT_PEAK_DK1;
    var FCT_PEAK_DK2 = m.FCT_PEAK_DK2;
    var NUM_ORE_M = m.NUM_ORE_M;
    var NUM_ORE_OP = m.NUM_ORE_OP;

    // BASE
    if (result.base_DK1 !== null || result.base_DK2 !== null) {
      if (NUM_ORE_M !== null && NUM_ORE_M !== undefined && NUM_ORE_M !== 0) {
        var baseDen = NUM_ORE_M * 1000;
        if (result.base_DK1 !== null) result.base_DK1[monthKey2] = safeDiv(FCT_BASE_DK1, baseDen);
        if (result.base_DK2 !== null) result.base_DK2[monthKey2] = safeDiv(FCT_BASE_DK2, baseDen);
      } else {
        if (result.base_DK1 !== null) result.base_DK1[monthKey2] = null;
        if (result.base_DK2 !== null) result.base_DK2[monthKey2] = null;
      }
    }

    // PEAK
    if (result.peak_DK1 !== null || result.peak_DK2 !== null) {
      var peakHours = (NUM_ORE_M !== null && NUM_ORE_M !== undefined && NUM_ORE_OP !== null && NUM_ORE_OP !== undefined)
        ? (NUM_ORE_M - NUM_ORE_OP)
        : null;

      if (peakHours !== null && peakHours !== 0) {
        var peakDen = peakHours * 1000;
        if (result.peak_DK1 !== null) result.peak_DK1[monthKey2] = safeDiv(FCT_PEAK_DK1, peakDen);
        if (result.peak_DK2 !== null) result.peak_DK2[monthKey2] = safeDiv(FCT_PEAK_DK2, peakDen);
      } else {
        if (result.peak_DK1 !== null) result.peak_DK1[monthKey2] = null;
        if (result.peak_DK2 !== null) result.peak_DK2[monthKey2] = null;
      }
    }
  }

  return result;
}


function enrichBasePeakResult(basePeakResult, input) {
  // Clone (avoid mutating the original)
  var out = {};
  for (var k in basePeakResult) {
    if (basePeakResult.hasOwnProperty(k)) out[k] = basePeakResult[k];
  }

  out["Contract_id"] = input && input.contract_number ? input.contract_number : null;
  out["Product_Name"] = input && input.product_name ? input.product_name : null;
  out["valid_date"] = getValidityDate();
  out["commodity"] = input && input.commodity ? input.commodity : null;
  out["country"] = input && input.country ? input.country : null;

  out["THE"] = null;
  out["ETF"] = null;

  return out;
}


function run() {
  var outEl = document.getElementById("out");

  fetch("variables.json")
    .then(function (res) { return res.json(); })
    .then(function (obj) {
      // 1) calculate base/peak
      var basePeak = calculateBasePeak(obj);

      // 2) enrich with extra fields
      var finalResult = enrichBasePeakResult(basePeak, appInput);

      // 3) show output
      var txt = JSON.stringify(finalResult);
      if (outEl) outEl.textContent = txt;

      if (typeof console !== "undefined") console.log("Final Result:", finalResult);
    })
    .catch(function (err) {
      var msg = "Failed to load variables.json. Make sure you're running via a local HTTP server (Live Server). Error: " + err;
      if (outEl) outEl.textContent = msg;
      if (typeof console !== "undefined") console.error(msg);
    });
}

run();
