// GLSL for the planets, their atmospheres and rings, the stars and the sky.
//
// Everything is procedural: no textures. Each planet reads its family and a
// four-number seed (from its node ID) as instance attributes, so all planets
// are drawn in one call and still look different. Family indices match
// FAMILY_INDEX in planet-look.ts: 0 ocean, 1 gas giant, 2 storm, 3 jungle,
// 4 cracked, 5 crystal, 6 moon, 7 rocky.

/** Simplex noise (Ashima Arts / Ian McEwan, MIT), fbm, Voronoi and small helpers. */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
float fbm3(vec3 p){ float a=.5, s=0.; for(int i=0;i<3;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
vec3 hash33(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
vec3 voronoi(vec3 x){
  vec3 p=floor(x), f=fract(x); float d1=8., d2=8.; vec3 id=vec3(0.);
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 b=vec3(float(i),float(j),float(k)); vec3 r=b+hash33(p+b)-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=p+b; } else if(d<d2) d2=d;
  }
  return vec3(sqrt(d1), sqrt(d2), fract(dot(id, vec3(7.13,1.97,3.71))));
}
vec3 hueShift(vec3 c, float a){ const vec3 k=vec3(0.57735); float ca=cos(a); return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
`;

export const PLANET_VERTEX = /* glsl */ `
${NOISE}
uniform float uTime;
attribute vec3 aPos; attribute float aRadius; attribute vec4 aSeed; attribute vec3 aColor; attribute float aType;
attribute vec3 aStar; attribute vec3 aStarColor; attribute float aDim; attribute vec4 aExtra;
varying vec3 vBody; varying vec3 vN; varying vec3 vW; varying vec4 vSeed; varying vec3 vColor; varying float vType;
varying vec3 vStar; varying vec3 vStarColor; varying float vDim; varying vec4 vExtra; varying vec3 vCenter; varying float vRadius;
void main(){
  float tilt=(aSeed.w-.5)*0.9;
  float spin=uTime*(0.04+aSeed.z*0.1)*(aSeed.x>.8?-1.:1.)+aSeed.y*6.2831;
  vBody=rotY(spin)*(rotX(-tilt)*position);
  vN=normalize(position);
  vec3 w=aPos+position*aRadius; vW=w;
  vSeed=aSeed; vColor=aColor; vType=aType; vStar=aStar; vStarColor=aStarColor; vDim=aDim; vExtra=aExtra; vCenter=aPos; vRadius=aRadius;
  gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;

export const PLANET_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime;
varying vec3 vBody; varying vec3 vN; varying vec3 vW; varying vec4 vSeed; varying vec3 vColor; varying float vType;
varying vec3 vStar; varying vec3 vStarColor; varying float vDim; varying vec4 vExtra; varying vec3 vCenter; varying float vRadius;
void main(){
  vec3 N=normalize(vN);
  vec3 L=normalize(vStar-vW);
  vec3 V=normalize(cameraPosition-vW);
  float ndl=dot(N,L);
  vec3 p=normalize(vBody);
  vec3 q=p*(1.2+vSeed.x*1.3)+vSeed.xyz*37.;
  int t=int(vType+.5);
  vec3 base=hueShift(vColor,(vSeed.y-.5)*0.55);
  vec3 alb=vec3(.5); vec3 emis=vec3(0.); float spec=0.; float cloud=0.;
  vec3 off=vSeed.xyz*37.;
  if(t==0){ // ocean world
    float h=fbm(p*(0.9+vSeed.x*.7)+off)+(vSeed.w-.5)*0.3;
    float land=smoothstep(0.0,0.05,h);
    vec3 deep=base*0.16; vec3 shallow=mix(base*0.6,vec3(.25,.6,.65),.3);
    vec3 ocean=mix(deep,shallow,smoothstep(-.25,.0,h));
    vec3 green=hueShift(vec3(.18,.30,.12),(vSeed.z-.5)*1.4);
    vec3 sand=vec3(.58,.49,.34);
    float dry=fbm3(p*2.2+off+4.)+h*.8;
    vec3 ground=mix(green,sand,smoothstep(.05,.45,dry));
    ground=mix(ground,vec3(.45,.41,.38),smoothstep(.3,.55,h));
    alb=mix(ocean,ground,land);
    float capLat=.78+vSeed.z*.14;
    float ice=smoothstep(capLat,capLat+.05,abs(p.y)+fbm3(p*3.+off)*.08);
    alb=mix(alb,vec3(.92,.95,1.),ice);
    spec=(1.-land)*(1.-ice);
    cloud=smoothstep(.1,.6,fbm(p*vec3(1.6,3.2,1.6)+off+vec3(uTime*.012,0.,0.)))*(.25+vSeed.x*.55);
  } else if(t==1){ // gas giant
    float warp=fbm3(p*vec3(1.4,3.,1.4)+off)*.14+fbm(p*vec3(3.,16.,3.)+off)*.018;
    float lat=p.y+warp;
    float f1=5.+floor(vSeed.z*9.), f2=f1*2.7+3.;
    float b1=sin(lat*f1+vSeed.x*6.)*.5+.5; float b2=sin(lat*f2+vSeed.w*6.)*.5+.5;
    float b3=smoothstep(.4,.9,sin(lat*f1*.5+vSeed.y*6.)*.5+.5);
    vec3 c1=base; vec3 c2=mix(vec3(.96,.9,.78),base,.2); vec3 c3=hueShift(base*.5,-.3); vec3 c4=hueShift(base,(vSeed.w-.5)*1.2)*.8;
    alb=mix(c3,c1,b1); alb=mix(alb,c2,b2*.5); alb=mix(alb,c4,b3*.5);
    vec3 spot=normalize(vec3(cos(vSeed.y*6.28),(vSeed.w-.5)*.8,sin(vSeed.y*6.28)));
    float sd=length((p-spot)*vec3(1.,2.4,1.));
    float storm=smoothstep(.22,.1,sd)*step(.35,vSeed.x);
    alb=mix(alb,hueShift(base,.3)*.85+vec3(.12,.02,0.),storm*(.7+.3*sin(sd*45.)));
    float lum=dot(alb,vec3(.3,.59,.11));
    alb=mix(alb,vec3(lum)*vec3(1.,.95,.88),vSeed.y*.55)*(.75+vSeed.w*.45);
  } else if(t==2){ // storm world
    vec3 w1=vec3(fbm3(p*1.1+off),fbm3(p*1.1+off+5.2),fbm3(p*1.1+off+9.7));
    float n=fbm(p*vec3(1.,2.4,1.)*1.2+off+w1*1.8+vec3(0.,uTime*.01,0.));
    alb=mix(base*.2,base*1.05,smoothstep(-.45,.45,n));
    alb=mix(alb,vec3(.92,.88,1.),smoothstep(.3,.65,n)*.65);
    vec3 eye=normalize(vec3(sin(vSeed.w*6.28),(vSeed.x-.5)*1.2,cos(vSeed.w*6.28)));
    float ed=length(p-eye); float sw=sin(atan(p.y-eye.y,dot(p,cross(eye,vec3(0.,1.,0.))))*2.+ed*30.);
    alb=mix(alb,vec3(.95,.92,1.),smoothstep(.25,.0,ed)*(.5+.5*sw)*.6);
    float bolt=smoothstep(.97,1.,snoise(p*12.+off+uTime*.6))*step(.5,vSeed.w);
    emis+=vec3(.8,.75,1.)*bolt*.8;
  } else if(t==3){ // jungle world
    float n=fbm(p*(1.2+vSeed.x*.6)+off);
    vec3 dark=hueShift(base*.2,-.3); vec3 light=mix(base*.75,vec3(.65,.75,.35),.35);
    alb=mix(dark,light,smoothstep(-.4,.5,n));
    float rivers=smoothstep(.03,.0,abs(fbm3(p*2.4+off+2.)))*.7;
    alb=mix(alb,vec3(.06,.18,.28),rivers);
    cloud=smoothstep(.15,.6,fbm(p*vec3(2.,4.,2.)+off+vec3(uTime*.015,0.,0.)))*.5;
  } else if(t==4){ // cracked world: lava, molten desert, ice
    vec3 crust=vExtra.rgb;
    float n=fbm(p*1.6+off);
    alb=crust*(.55+.9*(n*.5+.5));
    float r1=1.-abs(snoise(p*(1.8+vSeed.x)+off+fbm3(p*3.+off)*.5));
    float r2=1.-abs(snoise(p*5.+off+3.));
    float cracks=smoothstep(.94,.99,r1)+smoothstep(.95,.995,r2)*.5;
    float pools=smoothstep(.25,.45,n)*step(.5,vSeed.w);
    vec3 glow=mix(vColor,vec3(1.,.55,.15),vExtra.r<.2?.55:.15)*1.3;
    emis+=glow*(cracks+pools*.8)*(1.1+.25*sin(uTime*.8+vSeed.x*20.));
    alb=mix(alb,glow*.3,clamp(cracks+pools,0.,1.));
  } else if(t==5){ // crystal world
    vec3 v=voronoi(q*2.6);
    float edge=smoothstep(.06,.0,v.y-v.x);
    alb=mix(base*.25,base*.9,.3+.7*v.z)+vec3(.05);
    spec=.6+.4*v.z;
    emis+=base*edge*.9;
  } else if(t==6){ // cratered moon
    vec3 v=voronoi(q*3.2);
    float rr=.25+.25*v.z;
    float bowl=smoothstep(rr,rr*.6,v.x); float rim=smoothstep(rr*.7,rr,v.x)*smoothstep(rr*1.25,rr,v.x);
    float n=fbm3(q*5.);
    float g=.42+.12*n-.14*bowl+.12*rim;
    vec3 v2=voronoi(q*9.); g-=.06*smoothstep(.3,.15,v2.x);
    alb=vec3(g)*mix(vec3(1.),vColor*1.4,.25);
  } else { // rocky
    float n=fbm(q*2.5);
    alb=mix(vec3(.28,.25,.23),vec3(.6,.55,.5),smoothstep(-.4,.5,n));
    alb=hueShift(alb,(vSeed.y-.5)*1.4)*mix(vec3(1.),vColor,.25);
    vec3 v=voronoi(q*2.);
    alb*=.8+.4*smoothstep(.1,.4,v.x);
  }
  // shading
  float day=smoothstep(-.12,.35,ndl);
  float lambert=max(ndl,0.);
  vec3 light=vStarColor*(lambert*1.15+day*.08);
  vec3 col=alb*(light+vec3(.025,.03,.05));
  // clouds lit, with soft shadow on surface
  col=mix(col,vec3(1.)*(light+.02),cloud);
  // ocean / crystal glint
  vec3 H=normalize(L+V);
  col+=vStarColor*spec*pow(max(dot(N,H),0.),60.)*.9*day;
  // atmosphere scattering at the limb
  float fr=pow(1.-max(dot(N,V),0.),3.);
  vec3 atmC=mix(vColor,vec3(.6,.8,1.),.35);
  col+=atmC*fr*vExtra.a*smoothstep(-.25,.4,ndl)*1.2;
  // emissive survives the night side
  col+=alb*.07*max(dot(N,V),0.);
  col+=emis;
  col*=mix(.22,1.,vDim);
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** A slightly larger back-facing shell that glows at the limb, lit by the star. */
export const ATMOSPHERE_VERTEX = /* glsl */ `
attribute vec3 aPos; attribute float aRadius; attribute vec3 aColor; attribute vec3 aStar; attribute vec3 aStarColor; attribute float aDim; attribute vec4 aExtra;
varying vec3 vN; varying vec3 vW; varying vec3 vColor; varying vec3 vStar; varying vec3 vStarColor; varying float vDim; varying float vAtm;
void main(){
  vN=normalize(position);
  vec3 w=aPos+position*aRadius*1.14; vW=w;
  vColor=aColor; vStar=aStar; vStarColor=aStarColor; vDim=aDim; vAtm=aExtra.a;
  gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying vec3 vColor; varying vec3 vStar; varying vec3 vStarColor; varying float vDim; varying float vAtm;
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW); vec3 L=normalize(vStar-vW);
  float k=clamp(-dot(N,V)/.48,0.,1.);
  float a=pow(k,2.2)*vAtm;
  float lit=smoothstep(-.35,.45,dot(N,L));
  vec3 c=mix(vColor,vec3(.6,.8,1.),.35)*vStarColor*(.15+lit)*1.3;
  gl_FragColor=vec4(c*a*mix(.25,1.,vDim),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const RING_VERTEX = /* glsl */ `
${NOISE}
attribute vec3 aPos; attribute float aRadius; attribute vec4 aSeed; attribute vec3 aColor; attribute vec3 aStar; attribute vec3 aStarColor; attribute float aDim;
varying float vR; varying vec3 vW; varying vec4 vSeed; varying vec3 vColor; varying vec3 vStar; varying vec3 vStarColor; varying float vDim; varying vec3 vCenter; varying float vRadius; varying vec3 vNrm;
void main(){
  float tilt=(aSeed.w-.5)*0.9;
  vR=length(position.xz);
  vec3 local=rotX(tilt)*position;
  vNrm=rotX(tilt)*vec3(0.,1.,0.);
  vec3 w=aPos+local*aRadius; vW=w;
  vSeed=aSeed; vColor=aColor; vStar=aStar; vStarColor=aStarColor; vDim=aDim; vCenter=aPos; vRadius=aRadius;
  gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;

/** Banded rings, with the planet's shadow cast across them. */
export const RING_FRAGMENT = /* glsl */ `
${NOISE}
varying float vR; varying vec3 vW; varying vec4 vSeed; varying vec3 vColor; varying vec3 vStar; varying vec3 vStarColor; varying float vDim; varying vec3 vCenter; varying float vRadius; varying vec3 vNrm;
void main(){
  float inner=1.35+vSeed.x*.25, outer=2.0+vSeed.z*.6;
  float u=(vR-inner)/(outer-inner);
  if(u<0.||u>1.) discard;
  float bands=.6+.4*snoise(vec3(vR*(6.+vSeed.y*8.),vSeed.x*30.,0.));
  bands*=.75+.25*sin(vR*(40.+vSeed.w*30.));
  float gap=smoothstep(.02,.0,abs(u-(.45+vSeed.w*.3)))*.9;
  float a=clamp(bands,0.,1.)*smoothstep(0.,.08,u)*smoothstep(1.,.85,u)*(1.-gap)*.85;
  vec3 L=normalize(vStar-vW);
  // planet shadow on the ring
  vec3 oc=vW-vCenter; float b=dot(oc,L); float c=dot(oc,oc)-vRadius*vRadius;
  float shadow=(b<0. && b*b-c>0.)?.12:1.;
  float lit=.35+.65*abs(dot(normalize(vNrm),L));
  vec3 col=mix(vec3(.85,.78,.66),vColor,.45)*vStarColor*lit*shadow;
  gl_FragColor=vec4(col*mix(.25,1.,vDim),a*mix(.35,1.,vDim));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const STAR_VERTEX = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main(){
  vN=normalize(position);
  vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;

/** Boiling surface with limb darkening. */
export const STAR_FRAGMENT = /* glsl */ `
${NOISE}
uniform vec3 uColor; uniform float uTime; uniform float uSeed;
varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW);
  float mu=max(dot(N,V),0.);
  float gran=fbm(N*7.+uSeed+vec3(uTime*.05));
  float limb=.45+.55*pow(mu,.5);
  vec3 c=uColor*(1.25+gran*.5)*limb;
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;

/** Nebula clouds, a dusty band and three layers of stars, from one seed. */
export const SKY_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uSeed;
varying vec3 vDir;
vec3 starLayer(vec3 d, float scale, float density, float size){
  vec3 g=d*scale; vec3 id=floor(g); vec3 f=fract(g);
  vec3 h=hash33(id+uSeed);
  if(h.x>density) return vec3(0.);
  vec3 pos=.2+.6*hash33(id*1.7+3.1);
  float dist=length(f-pos);
  float br=pow(h.y,6.)*2.+.12;
  float core=smoothstep(size,0.,dist);
  vec3 tint=mix(vec3(.65,.75,1.),vec3(1.,.8,.6),h.z);
  if(h.z>.4&&h.z<.7) tint=vec3(1.);
  return tint*core*br;
}
void main(){
  vec3 d=normalize(vDir);
  vec3 plane=normalize(vec3(.25,1.,.35));
  float lat=dot(d,plane);
  float band=exp(-lat*lat/.07);
  vec3 s=d*1.6+uSeed;
  float n1=fbm(s*1.3); float n2=fbm(s*2.7+n1*1.5);
  float neb=smoothstep(-.15,.75,n2)*(.35+band*.9);
  vec3 c1=vec3(.08,.05,.22), c2=vec3(.32,.09,.42), c3=vec3(.04,.22,.36), c4=vec3(.55,.18,.30);
  vec3 neb_c=mix(c1,c2,smoothstep(-.3,.6,n1));
  neb_c=mix(neb_c,c3,smoothstep(.2,.7,fbm3(s*1.9+7.)));
  neb_c=mix(neb_c,c4,smoothstep(.45,.8,n2)*.6);
  float dust=smoothstep(.0,.55,fbm(s*4.2+3.))*band;
  vec3 col=neb_c*neb*.75*(1.-dust*.75);
  // milky band glow
  col+=vec3(.12,.11,.2)*band*(.4+.6*fbm3(s*6.))*(1.-dust*.8);
  // stars, denser in the band
  col+=starLayer(d,90.,.7,.06)*1.3;
  col+=starLayer(d,220.,.6+band*.35,.1)*.8;
  col+=starLayer(d,520.,.35+band*.6,.14)*.35*(1.-dust*.6);
  gl_FragColor=vec4(col,1.);
}`;

export const GALAXY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;

/** A spiral galaxy on a quad: logarithmic arms, dust lanes and a bright core. */
export const GALAXY_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uArms; uniform float uTwist; uniform vec3 uCore; uniform vec3 uArm; uniform float uSeed;
varying vec2 vUv;
void main(){
  vec2 p=(vUv-.5)*2.;
  float r=length(p); if(r>1.) discard;
  float th=atan(p.y,p.x);
  float spiral=cos(uArms*(th-log(r+.02)*uTwist));
  float arms=pow(.5+.5*spiral,3.);
  float clump=.6+.8*max(snoise(vec3(p*9.,uSeed)),0.);
  float disk=exp(-r*3.2);
  float core=exp(-r*r*55.);
  float dust=smoothstep(.2,.9,.5+.5*cos(uArms*(th-log(r+.02)*uTwist)+.9))*smoothstep(.05,.25,r)*.6;
  vec3 c=uArm*arms*disk*clump*(1.-dust)*2.+uCore*(core*3.+disk*.5);
  c*=smoothstep(1.,.6,r);
  gl_FragColor=vec4(c,1.);
}`;
