import http from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {extname,join,normalize,resolve,sep} from 'node:path';

const root=resolve(process.env.SMOKE_ROOT||'out');
const port=Number(process.env.SMOKE_PORT||4173);
const prefix='/rulers-of-russia';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.pbf':'application/x-protobuf'};

function resolveRequest(urlString){
  const url=new URL(urlString,'http://127.0.0.1');
  let pathname=decodeURIComponent(url.pathname);
  if(pathname===prefix)pathname='/';
  else if(pathname.startsWith(`${prefix}/`))pathname=pathname.slice(prefix.length);
  const clean=normalize(pathname).replace(/^([/\\])+/, '');
  let target=resolve(root,clean);
  if(target!==root&&!target.startsWith(root+sep))return null;
  if(pathname.endsWith('/'))target=join(target,'index.html');
  else if(existsSync(target)&&statSync(target).isDirectory())target=join(target,'index.html');
  else if(!existsSync(target)&&!extname(target)&&existsSync(`${target}.html`))target=`${target}.html`;
  return target;
}

const server=http.createServer((req,res)=>{
  const target=resolveRequest(req.url||'/');
  if(!target||!existsSync(target)||!statSync(target).isFile()){
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});
    res.end('Not found');
    return;
  }
  const type=mime[extname(target).toLowerCase()]||'application/octet-stream';
  res.writeHead(200,{'content-type':type,'cache-control':'no-store'});
  createReadStream(target).pipe(res);
});

server.listen(port,'127.0.0.1',()=>{
  console.log(`Territory smoke server: http://127.0.0.1:${port}${prefix}/territory/`);
});
