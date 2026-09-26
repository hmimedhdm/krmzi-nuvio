const KRMZI = "https://krmzi.org";
const API = "https://api.dfkz.site/krmzi";
const CINEMETA = "https://v3-cinemeta.strem.io/meta";

function getText(url) {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
}

function getJson(url) {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json"
    }
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(s) {
  return String(s || "")
    .replace(/^مسلسل\s+/i, "")
    .replace(/^فيلم\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function score(a, b) {
  a = norm(cleanTitle(a));
  b = norm(cleanTitle(b));

  if (!a || !b) return 0;
  if (a === b) return 100;

  if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 85;

  var aw = a.split(" ");
  var bw = b.split(" ");
  var hits = 0;

  for (var i = 0; i < aw.length; i++) {
    if (aw[i].length >= 3 && bw.indexOf(aw[i]) >= 0) {
      hits++;
    }
  }

  return hits * 10;
}

function unique(arr) {
  var out = [];
  var seen = {};

  for (var i = 0; i < arr.length; i++) {
    var k = String(arr[i] || "");

    if (k && !seen[k]) {
      seen[k] = true;
      out.push(k);
    }
  }

  return out;
}

/* -------------------------------------------------------
   TMDB / Cinemeta titles
------------------------------------------------------- */

function getTitles(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";

  return getJson(
    CINEMETA + "/" + type + "/" +
    encodeURIComponent(String(tmdbId)) + ".json"
  )
    .then(function (d) {
      var m = d && d.meta ? d.meta : d;
      var t = [];

      if (!m) return [];

      if (m.name) t.push(m.name);
      if (m.title) t.push(m.title);
      if (m.originalName) t.push(m.originalName);
      if (m.original_title) t.push(m.original_title);
      if (m.originalTitle) t.push(m.originalTitle);

      return unique(t);
    })
    .catch(function () {
      return [];
    });
}

/* -------------------------------------------------------
   Old Krmzi API - still useful for finding series
------------------------------------------------------- */

function apiSearch(title) {
  return getJson(
    API + "/?q=" + encodeURIComponent(title)
  )
    .then(function (d) {
      return d && Array.isArray(d.series) ? d.series : [];
    })
    .catch(function () {
      return [];
    });
}

function bestSeries(items, titles) {
  var best = null;
  var bestScore = 0;

  for (var i = 0; i < items.length; i++) {
    var x = items[i];

    if (!x || !x.id || !x.title) continue;

    for (var j = 0; j < titles.length; j++) {
      var s = score(x.title, titles[j]);

      if (s > bestScore) {
        bestScore = s;
        best = x;
      }
    }
  }

  return best;
}

/* -------------------------------------------------------
   Krmzi series page
------------------------------------------------------- */

function getSeriesPage(id) {
  return getText(
    API + "/series.php?id=" + encodeURIComponent(id)
  );
}

/* -------------------------------------------------------
   Extract episode URLs from Krmzi series HTML/JSON
------------------------------------------------------- */

function extractEpisodeIds(text) {
  var result = [];

  /*
   * JSON API format:
   * "id":"230903",
   * "episode_number":"101"
   */

  var re1 =
    /"id"\s*:\s*"([^"]+)"[\s\S]{0,500}?"episode_number"\s*:\s*"(\d+)"/gi;

  var m;

  while ((m = re1.exec(text)) !== null) {
    result.push({
      id: m[1],
      number: Number(m[2])
    });
  }

  /*
   * Reverse order sometimes appears in responses.
   */

  var re2 =
    /"episode_number"\s*:\s*"(\d+)"[\s\S]{0,500}?"id"\s*:\s*"([^"]+)"/gi;

  while ((m = re2.exec(text)) !== null) {
    result.push({
      id: m[2],
      number: Number(m[1])
    });
  }

  return result;
}

/* -------------------------------------------------------
   Krmzi website episode page
------------------------------------------------------- */

function slugifyArabic(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "-");
}

function episodePageCandidates(title, episode) {
  var t = cleanTitle(title);
  var e = String(episode);

  var base = slugifyArabic(t);

  return unique([
    KRMZI + "/episode/" +
      encodeURIComponent(t + " الحلقة " + e) + "/",

    KRMZI + "/episode/" +
      encodeURIComponent("مسلسل " + t + " الحلقة " + e) + "/",

    KRMZI + "/episode/" +
      encodeURIComponent(base + "-الحلقة-" + e) + "/"
  ]);
}

/* -------------------------------------------------------
   Extract HLS URLs
------------------------------------------------------- */

function extractM3U8(text) {
  var urls = [];

  /*
   * Direct URLs inside HTML / JS
   */

  var patterns = [
    /https?:\/\/[^"'\\\s<>]+?\.m3u8(?:\?[^"'\\\s<>]*)?/gi,
    /https?:\\\/\\\/[^"'\\\s<>]+?\.m3u8(?:\?[^"'\\\s<>]*)?/gi
  ];

  for (var p = 0; p < patterns.length; p++) {
    var re = patterns[p];
    var m;

    while ((m = re.exec(text)) !== null) {
      var u = m[0]
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&")
        .replace(/&amp;/g, "&");

      if (u.indexOf(".m3u8") >= 0) {
        urls.push(u);
      }
    }
  }

  return unique(urls);
}

/* -------------------------------------------------------
   Extract iframe/player URLs
------------------------------------------------------- */

function extractPlayers(text) {
  var urls = [];

  var re =
    /(?:iframe|embed|player)[^>]{0,500}(?:src|url|file)\s*[:=]\s*["']([^"']+)["']/gi;

  var m;

  while ((m = re.exec(text)) !== null) {
    var u = m[1];

    if (u.indexOf("//") === 0) {
      u = "https:" + u;
    }

    if (u.indexOf("http") === 0) {
      urls.push(u);
    }
  }

  return unique(urls);
}

/* -------------------------------------------------------
   Search website episode page
------------------------------------------------------- */

function findEpisodePage(titles, episode) {
  var candidates = [];

  for (var i = 0; i < titles.length; i++) {
    var c = episodePageCandidates(titles[i], episode);

    for (var j = 0; j < c.length; j++) {
      candidates.push(c[j]);
    }
  }

  candidates = unique(candidates);

  function next(index) {
    if (index >= candidates.length) {
      return Promise.resolve(null);
    }

    return getText(candidates[index])
      .then(function (html) {
        if (
          html &&
          (
            html.indexOf(".m3u8") >= 0 ||
            html.indexOf("jwplayer") >= 0 ||
            html.indexOf("JWPlayer") >= 0 ||
            html.indexOf("sources") >= 0
          )
        ) {
          return {
            url: candidates[index],
            html: html
          };
        }

        return next(index + 1);
      })
      .catch(function () {
        return next(index + 1);
      });
  }

  return next(0);
}

/* -------------------------------------------------------
   Get streams from Krmzi
------------------------------------------------------- */

function getKrmziStreams(tmdbId, mediaType, season, episode) {
  if (mediaType !== "tv" || episode == null) {
    return Promise.resolve([]);
  }

  return getTitles(tmdbId, mediaType)
    .then(function (titles) {
      if (!titles.length) {
        throw new Error("No Cinemeta title");
      }

      /*
       * First try the old API because it is much faster.
       */

      return Promise.all(
        titles.map(function (t) {
          return apiSearch(t);
        })
      ).then(function (groups) {
        var all = [];

        groups.forEach(function (g) {
          all = all.concat(g);
        });

        var s = bestSeries(all, titles);

        if (!s) {
          throw new Error("Krmzi series not found");
        }

        return {
          series: s,
          titles: titles
        };
      });
    })
    .then(function (ctx) {
      return getSeriesPage(ctx.series.id)
        .then(function (page) {
          var eps = extractEpisodeIds(page);

          var wanted = null;

          for (var i = 0; i < eps.length; i++) {
            if (eps[i].number === Number(episode)) {
              wanted = eps[i];
              break;
            }
          }

          if (!wanted) {
            throw new Error(
              "Episode " + episode + " not found"
            );
          }

          return {
            titles: ctx.titles,
            episodeId: wanted.id
          };
        });
    })
    .then(function (ctx) {

      /*
       * IMPORTANT:
       * Do NOT use ep.php anymore.
       *
       * Try to locate the actual Krmzi episode page and
       * extract the temporary JWPlayer HLS URL.
       */

      return findEpisodePage(ctx.titles, episode)
        .then(function (page) {

          if (!page) {
            throw new Error("Episode page not found");
          }

          var streams = [];
          var m3u8 = extractM3U8(page.html);

          for (var i = 0; i < m3u8.length; i++) {
            streams.push({
              name: "Krmzi",
              title: "Krmzi • HLS " + (i + 1),
              url: m3u8[i],
              quality: "Auto",
              headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": page.url
              }
            });
          }

          return streams;
        });
    })
    .catch(function (e) {
      console.log("[Krmzi] " + e.message);
      return [];
    });
}

/* -------------------------------------------------------
   Movies
-------------------------------------------------------

   Krmzi's currently indexed public catalogue is primarily
   organized under /series/ and /episode/. We therefore
   return no movie stream rather than inventing a movie
   endpoint.
*/

function getStreams(tmdbId, mediaType, season, episode) {

  if (mediaType === "movie") {
    console.log(
      "[Krmzi] Movie endpoint not verified - returning []"
    );

    return Promise.resolve([]);
  }

  return getKrmziStreams(
    tmdbId,
    mediaType,
    season,
    episode
  );
}

module.exports = {
  getStreams
};
