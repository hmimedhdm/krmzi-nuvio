const KRMZI="https://api.dfkz.site/krmzi";
const CINEMETA="https://v3-cinemeta.strem.io/meta/tv";
function getJson(u){return fetch(u).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()})}
function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim()}
function clean(s){return String(s||"").replace(/^مسلسل\s+/i,"").trim()}
function score(a,b){a=norm(clean(a));b=norm(clean(b));if(!a||!b)return 0;if(a===b)return 100;if(a.includes(b)||b.includes(a))return 80;var aw=a.split(" "),bw=b.split(" "),n=0;for(var i=0;i<aw.length;i++)if(aw[i].length>=3&&bw.indexOf(aw[i])>=0)n++;return n*10}
function titles(id){return getJson(CINEMETA+"/"+encodeURIComponent(String(id))+".json").then(d=>{var m=d&&d.meta?d.meta:d,o=[];if(m){if(m.name)o.push(m.name);if(m.title)o.push(m.title);if(m.originalName)o.push(m.originalName);if(m.original_title)o.push(m.original_title)}return o.filter(Boolean)}).catch(()=>[])}
function search(t){return getJson(KRMZI+"/?q="+encodeURIComponent(t)).then(d=>d&&Array.isArray(d.series)?d.series:[]).catch(()=>[])}
function best(a,ts){var b=null,bs=0;for(var i=0;i<a.length;i++){var x=a[i];if(!x||!x.id||!x.title)continue;for(var j=0;j<ts.length;j++){var s=score(x.title,ts[j]);if(s>bs){bs=s;b=x}}}return b}
function getSeries(id){return getJson(KRMZI+"/series.php?id="+encodeURIComponent(id))}
function getEpisode(id){return getJson(KRMZI+"/ep.php?epid="+encodeURIComponent(id))}
function findEp(d,n){if(!d||!Array.isArray(d.episodes))return null;for(var i=0;i<d.episodes.length;i++)if(Number(d.episodes[i].episode_number)===Number(n))return d.episodes[i];return null}
function url(u){if(!u)return null;u=String(u).trim();return u.indexOf("//")===0?"https:"+u:u}
function makeStreams(d){if(!d||!Array.isArray(d.servers))return [];return d.servers.map(s=>({name:"Krmzi",title:"Krmzi • "+(s.name||"Server"),url:url(s.embed_url),quality:"Auto",headers:{"User-Agent":"Mozilla/5.0"}})).filter(x=>x.url)}
function getStreams(tmdbId,mediaType,season,episode){if(mediaType!=="tv"||episode==null)return Promise.resolve([]);return titles(tmdbId).then(ts=>{if(!ts.length)throw Error("TMDB title not found");return Promise.all(ts.map(search)).then(gs=>{var a=[],seen={};gs.forEach(g=>g.forEach(x=>{if(x&&x.id&&!seen[x.id]){seen[x.id]=1;a.push(x)}}));var s=best(a,ts);if(!s)throw Error("Krmzi series not found");return getSeries(s.id)})}).then(sd=>{var ep=findEp(sd,episode);if(!ep)throw Error("Episode "+episode+" not found");return getEpisode(ep.id)}).then(makeStreams).catch(e=>{console.error("[Krmzi] "+e.message);return []})}
module.exports={getStreams};
