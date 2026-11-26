// DAWN CANYON RUN — hud.js
// The heads-up display: glowing amber digital readouts (ALT / SPD / HDG), the next-ring arrow
// and distance, mission counters, the flashing STALL warning, centre messages, and the bottom
// instrument panel — six lit round gauges drawn on a 2D canvas every frame: attitude indicator,
// altimeter, airspeed, heading compass, vertical speed and throttle/RPM. Everything is sized
// and weighted to stay readable when the screenshot is shrunk to a contact-sheet thumbnail.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});

  var elements = {};
  var gaugeContext = null;
  var messageUntil = 0;
  var messageShownAt = 0;

  var GAUGE_SIZE = 104;
  var GAUGE_GAP = 8;
  var GAUGE_COUNT = 6;

  function grab(id) {
    return document.getElementById(id);
  }

  function initHud() {
    elements.hud = grab('hud');
    elements.alt = grab('altValue');
    elements.spd = grab('spdValue');
    elements.hdg = grab('hdgValue');
    elements.ringArrow = grab('ringArrow');
    elements.ringDist = grab('ringDist');
    elements.ringNavLabel = grab('ringNavLabel');
    elements.ring = grab('ringValue');
    elements.time = grab('timeValue');
    elements.score = grab('scoreValue');
    elements.stall = grab('stallWarning');
    elements.message = grab('centerMessage');
    elements.throttleFill = grab('throttleFill');
    elements.boostTag = grab('boostTag');
    var canvas = grab('gauges');
    gaugeContext = canvas.getContext('2d');
  }

  function setHudVisible(visible) {
    if (elements.hud) elements.hud.classList.toggle('hidden', !visible);
  }

  function padNumber(value, width) {
    var text = String(Math.max(0, Math.floor(value)));
    while (text.length < width) text = '0' + text;
    return text;
  }

  // Seconds -> "MM:SS" for the timer and the results screen.
  function formatClock(seconds) {
    var total = Math.max(0, Math.floor(seconds));
    return padNumber(Math.floor(total / 60), 2) + ':' + padNumber(total % 60, 2);
  }

  // Show a centre message ("RING 4  +1000") for a couple of seconds.
  function showCenterMessage(text, subtext, seconds) {
    if (!elements.message) return;
    elements.message.innerHTML = text + (subtext ? '<small>' + subtext + '</small>' : '');
    messageShownAt = performance.now();
    messageUntil = messageShownAt + (seconds || 2) * 1000;
    elements.message.style.opacity = '1';
  }

  function tickMessages() {
    if (!elements.message) return;
    var now = performance.now();
    if (messageUntil && now > messageUntil) {
      elements.message.style.opacity = '0';
      messageUntil = 0;
    }
  }

  // ---- gauges ---------------------------------------------------------------

  // Canvas angle for a 270-degree sweep gauge: frac 0 at lower-left, 1 at lower-right.
  function sweepAngle(frac) {
    return Math.PI * (0.75 + 1.5 * Math.max(0, Math.min(1, frac)));
  }

  function drawGaugeShell(cx, cy, radius, label) {
    var ctx = gaugeContext;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#10141c';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffb347';
    ctx.shadowColor = 'rgba(255, 170, 60, 0.85)';
    ctx.shadowBlur = 7;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffb347';
    ctx.font = '700 9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + radius - 6);
    ctx.restore();
  }

  function drawTicks(cx, cy, radius, count, majorEvery) {
    var ctx = gaugeContext;
    ctx.save();
    ctx.strokeStyle = '#e8ddc8';
    for (var i = 0; i <= count; i += 1) {
      var angle = sweepAngle(i / count);
      var major = i % majorEvery === 0;
      var inner = radius * (major ? 0.74 : 0.82);
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * radius * 0.92, cy + Math.sin(angle) * radius * 0.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNeedle(cx, cy, radius, frac, color) {
    var ctx = gaugeContext;
    var angle = sweepAngle(frac);
    ctx.save();
    ctx.strokeStyle = color || '#ffd24d';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(255, 200, 80, 0.9)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * radius * 0.18, cy - Math.sin(angle) * radius * 0.18);
    ctx.lineTo(cx + Math.cos(angle) * radius * 0.8, cy + Math.sin(angle) * radius * 0.8);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd24d';
    ctx.fill();
    ctx.restore();
  }

  function gaugeCenter(index) {
    var totalWidth = GAUGE_COUNT * GAUGE_SIZE + (GAUGE_COUNT - 1) * GAUGE_GAP;
    var startX = (672 - totalWidth) / 2;
    return { x: startX + index * (GAUGE_SIZE + GAUGE_GAP) + GAUGE_SIZE / 2, y: 59 };
  }

  // The attitude ball: sky and ground halves that roll with the plane and slide with pitch,
  // behind a fixed yellow aircraft symbol.
  function drawAttitude(cx, cy, radius, pitch, roll) {
    var ctx = gaugeContext;
    drawGaugeShell(cx, cy, radius, 'ATTITUDE');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-roll);
    ctx.translate(0, pitch * 46);
    ctx.fillStyle = '#3d6f9e';
    ctx.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 2);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(-radius * 2, 0, radius * 4, radius * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius * 2, 0);
    ctx.lineTo(radius * 2, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.2;
    [-0.18, 0.18].forEach(function (offset) {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.32, offset * radius * 2.2);
      ctx.lineTo(radius * 0.32, offset * radius * 2.2);
      ctx.stroke();
    });
    ctx.restore();
    // Fixed symbol.
    ctx.save();
    ctx.strokeStyle = '#ffd24d';
    ctx.lineWidth = 3.4;
    ctx.shadowColor = 'rgba(255, 200, 80, 0.9)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.55, cy);
    ctx.lineTo(cx - radius * 0.16, cy);
    ctx.lineTo(cx, cy + radius * 0.14);
    ctx.lineTo(cx + radius * 0.16, cy);
    ctx.lineTo(cx + radius * 0.55, cy);
    ctx.stroke();
    ctx.restore();
  }

  function drawAltimeter(cx, cy, radius, altitudeFeet) {
    drawGaugeShell(cx, cy, radius, 'ALT x100');
    drawTicks(cx, cy, radius, 12, 3);
    drawNeedle(cx, cy, radius, altitudeFeet / 1200);
    var ctx = gaugeContext;
    ctx.fillStyle = '#e8ddc8';
    ctx.font = '700 10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(altitudeFeet / 10) * 10), cx, cy + radius * 0.52);
  }

  function drawAirspeed(cx, cy, radius, speedKnots, stallKnots) {
    drawGaugeShell(cx, cy, radius, 'AIRSPEED');
    drawTicks(cx, cy, radius, 10, 2);
    var ctx = gaugeContext;
    // Red arc below the stall speed.
    ctx.save();
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.86, sweepAngle(0), sweepAngle(stallKnots / 200));
    ctx.stroke();
    ctx.restore();
    drawNeedle(cx, cy, radius, speedKnots / 200);
  }

  // Rotating compass card: the card turns under a fixed lubber mark at the top.
  function drawCompass(cx, cy, radius, headingDeg) {
    drawGaugeShell(cx, cy, radius, 'HEADING');
    var ctx = gaugeContext;
    ctx.save();
    var points = [
      { deg: 0, text: 'N' }, { deg: 45, text: '' }, { deg: 90, text: 'E' }, { deg: 135, text: '' },
      { deg: 180, text: 'S' }, { deg: 225, text: '' }, { deg: 270, text: 'W' }, { deg: 315, text: '' },
    ];
    points.forEach(function (point) {
      var relative = (point.deg - headingDeg) * Math.PI / 180;
      var angle = -Math.PI / 2 + relative;
      var x = cx + Math.cos(angle) * radius * 0.68;
      var y = cy + Math.sin(angle) * radius * 0.68;
      if (point.text) {
        ctx.fillStyle = point.text === 'N' ? '#ff5a4d' : '#e8ddc8';
        ctx.font = '800 12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(point.text, x, y);
      } else {
        ctx.fillStyle = '#e8ddc8';
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // Lubber triangle at the top.
    ctx.fillStyle = '#ffd24d';
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius + 5);
    ctx.lineTo(cx - 5, cy - radius + 13);
    ctx.lineTo(cx + 5, cy - radius + 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd9a0';
    ctx.font = '700 12px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(padNumber(headingDeg, 3), cx, cy + radius * 0.45);
    ctx.restore();
  }

  function drawVerticalSpeed(cx, cy, radius, verticalFpm) {
    drawGaugeShell(cx, cy, radius, 'VERT SPD');
    drawTicks(cx, cy, radius, 8, 2);
    var frac = 0.5 + (Math.max(-2000, Math.min(2000, verticalFpm)) / 2000) * 0.5;
    drawNeedle(cx, cy, radius, frac, verticalFpm < -900 ? '#ff5a4d' : '#ffd24d');
  }

  function drawRpm(cx, cy, radius, rpm) {
    drawGaugeShell(cx, cy, radius, 'RPM %');
    drawTicks(cx, cy, radius, 10, 2);
    var ctx = gaugeContext;
    ctx.save();
    ctx.strokeStyle = '#37d67a';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.86, sweepAngle(0.55), sweepAngle(0.85));
    ctx.stroke();
    ctx.strokeStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.86, sweepAngle(0.85), sweepAngle(1));
    ctx.stroke();
    ctx.restore();
    drawNeedle(cx, cy, radius, rpm);
  }

  // Redraw all six gauges from the flight state.
  function drawGauges(flight) {
    if (!gaugeContext) return;
    var ctx = gaugeContext;
    ctx.clearRect(0, 0, 672, 118);
    var radius = GAUGE_SIZE / 2 - 3;
    var c0 = gaugeCenter(0);
    drawAttitude(c0.x, c0.y, radius, flight.pitch, flight.roll);
    var c1 = gaugeCenter(1);
    drawAltimeter(c1.x, c1.y, radius, flight.altitudeFeet);
    var c2 = gaugeCenter(2);
    drawAirspeed(c2.x, c2.y, radius, flight.speedKnots, flight.stallKnots);
    var c3 = gaugeCenter(3);
    drawCompass(c3.x, c3.y, radius, flight.headingDeg);
    var c4 = gaugeCenter(4);
    drawVerticalSpeed(c4.x, c4.y, radius, flight.verticalFpm);
    var c5 = gaugeCenter(5);
    drawRpm(c5.x, c5.y, radius, flight.rpm);
  }

  // Refresh every HUD element from the flight state the main loop passes in.
  function updateHud(flight) {
    if (!elements.alt) return;
    elements.alt.textContent = String(Math.round(flight.altitudeFeet));
    elements.spd.textContent = String(Math.round(flight.speedKnots));
    elements.hdg.textContent = padNumber(flight.headingDeg, 3);
    elements.ring.textContent = flight.ringsPassed + '/' + flight.ringTotal;
    elements.time.textContent = formatClock(flight.elapsedSeconds);
    elements.score.textContent = String(Math.round(flight.score));
    elements.ringNavLabel.textContent = flight.nextTargetLabel;
    elements.ringDist.textContent = flight.nextTargetDistance < 1000
      ? Math.round(flight.nextTargetDistance) + ' m'
      : (flight.nextTargetDistance / 1000).toFixed(1) + ' km';
    elements.ringArrow.style.transform = 'rotate(' + (flight.nextTargetBearingDeg - 90) + 'deg)';
    elements.throttleFill.style.width = Math.round(flight.throttle * 100) + '%';
    elements.boostTag.style.visibility = flight.boost ? 'visible' : 'hidden';
    var showStall = flight.stalling && Math.floor(performance.now() / 280) % 2 === 0;
    elements.stall.style.display = showStall ? 'block' : 'none';
    drawGauges(flight);
    tickMessages();
  }

  DCR.hud = {
    initHud: initHud,
    setHudVisible: setHudVisible,
    updateHud: updateHud,
    showCenterMessage: showCenterMessage,
    formatClock: formatClock,
    padNumber: padNumber,
  };
})();
