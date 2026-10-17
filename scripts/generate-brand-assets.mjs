/** Codimate B / CONSULT. One vector geometry for web, install icons and Android. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const teal = '#145D56', ivory = '#FFFDF6', mint = '#C5E1D5';
// Bold open C with a speech tail; all coordinates are in the 256px master.
const mark = 'M178 67C169 48 155 43 137 43H109C70 43 47 68 47 105V139C47 177 70 198 107 198H156L188 219C193 222 197 218 195 212L184 175C181 164 173 161 164 165C156 169 149 170 139 170H109C87 170 75 160 75 138V106C75 84 87 72 109 72H138C147 72 152 75 157 82C165 94 187 88 178 67Z';
const dot = '<rect x="166" y="112" width="28" height="28" rx="8" fill="'+mint+'"/>';
const glyph = (color=ivory, detail=true) => `<path fill="${color}" d="${mark}"/>${detail?dot:''}`;
const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${content}</svg>\n`;
const tile = svg(`<rect width="256" height="256" rx="56" fill="${teal}"/>${glyph()}`);
const maskable = svg(`<path fill="${teal}" d="M0 0H256V256H0Z"/><g transform="translate(25.6 25.6) scale(.8)">${glyph()}</g>`);
const favicon = svg(`<style>path{fill:${teal}}@media(prefers-color-scheme:dark){path{fill:${ivory}}}</style><g transform="translate(-25 -28) scale(1.2)">${glyph(teal,false)}</g>`);
const out = async (file, data) => {await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data)};
const png = async (source,size,file) => out(file,await sharp(Buffer.from(source)).resize(size,size).png().toBuffer());
await out('public/brand/codimate.svg',tile);
await out('public/favicon.svg',favicon);
for (const size of [192,512]) await png(tile,size,`public/brand/icon-${size}.png`);
await png(maskable,512,'public/brand/icon-maskable-512.png');
await png(svg(`<path fill="${teal}" d="M0 0H256V256H0Z"/>${glyph()}`),180,'public/brand/apple-touch-icon.png');
const faviconPng = svg(`<rect width="256" height="256" rx="48" fill="${teal}"/>${glyph(ivory,false)}`);
const icoParts=[];
// Use standard bottom-up BGRA DIB frames, including the padded transparency mask.
// Chromium does not decode PNG-compressed small ICO frames consistently.
for(const size of [16,32,48]) {
 const rgba=await sharp(Buffer.from(faviconPng)).resize(size,size).ensureAlpha().raw().toBuffer();
 const dib=Buffer.alloc(40);dib.writeUInt32LE(40,0);dib.writeInt32LE(size,4);dib.writeInt32LE(size*2,8);dib.writeUInt16LE(1,12);dib.writeUInt16LE(32,14);dib.writeUInt32LE(size*size*4,20);
 const pixels=Buffer.alloc(size*size*4), mask=Buffer.alloc(Math.ceil(size/32)*4*size);
 for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
  const src=(y*size+x)*4,dst=((size-1-y)*size+x)*4;
  pixels[dst]=rgba[src+2];pixels[dst+1]=rgba[src+1];pixels[dst+2]=rgba[src];pixels[dst+3]=rgba[src+3];
  if(rgba[src+3]===0)mask[(size-1-y)*Math.ceil(size/32)*4+Math.floor(x/8)]|=1<<(7-x%8);
 }
 icoParts.push(Buffer.concat([dib,pixels,mask]));
}
const header=Buffer.alloc(6+16*icoParts.length);header.writeUInt16LE(1,2);header.writeUInt16LE(icoParts.length,4);let offset=header.length;
icoParts.forEach((buf,i)=>{const p=6+i*16;header[p]=header[p+1]=[16,32,48][i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buf.length,p+8);header.writeUInt32LE(offset,p+12);offset+=buf.length});
await out('public/favicon.ico',Buffer.concat([header,...icoParts]));
const res='android/app/src/main/res';
const foreground = svg(`<g transform="translate(51.2 51.2) scale(.6)">${glyph()}</g>`);
for(const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
 await png(tile,size,`${res}/mipmap-${density}/ic_launcher.png`);
 await png(svg(`<circle cx="128" cy="128" r="128" fill="${teal}"/><g transform="translate(20 20) scale(.84)">${glyph()}</g>`),size,`${res}/mipmap-${density}/ic_launcher_round.png`);
 await png(foreground,size*2.25,`${res}/mipmap-${density}/ic_launcher_foreground.png`);
}
const vector=(body,size=108)=>`<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="${size}dp" android:height="${size}dp" android:viewportWidth="256" android:viewportHeight="256">${body}</vector>\n`;
const vectorGlyph=`<path android:fillColor="${ivory}" android:pathData="${mark}"/><path android:fillColor="${mint}" android:pathData="M174,112H186Q194,112 194,120V132Q194,140 186,140H174Q166,140 166,132V120Q166,112 174,112Z"/>`;
await out(`${res}/drawable-v24/ic_launcher_foreground.xml`,vector(`<group android:translateX="51.2" android:translateY="51.2" android:scaleX=".6" android:scaleY=".6">${vectorGlyph}</group>`));
await out(`${res}/drawable/ic_launcher_background.xml`,vector(`<path android:fillColor="${teal}" android:pathData="M0,0H256V256H0Z"/>`));
await out(`${res}/drawable/codimate_splash_mark.xml`,vector(`<path android:fillColor="${teal}" android:pathData="M56,0H200Q256,0 256,56V200Q256,256 200,256H56Q0,256 0,200V56Q0,0 56,0Z"/>${vectorGlyph}`,88));
await out(`${res}/drawable/ic_launcher_monochrome.xml`,vector(`<group android:translateX="51.2" android:translateY="51.2" android:scaleX=".6" android:scaleY=".6"><path android:fillColor="#FFFFFF" android:pathData="${mark}"/></group>`));
for(const name of ['ic_launcher','ic_launcher_round']){
 const adaptive=(mono=false)=>`<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@drawable/ic_launcher_foreground"/>${mono?'<monochrome android:drawable="@drawable/ic_launcher_monochrome"/>':''}</adaptive-icon>\n`;
 await out(`${res}/mipmap-anydpi-v26/${name}.xml`,adaptive());
 await out(`${res}/mipmap-anydpi-v33/${name}.xml`,adaptive(true));
}
console.log('Generated web, favicon, Android adaptive/round/monochrome and splash assets.');
