/** Tactile tactical diorama. Original geometry; CC0 Poly Haven ground texture. */
export function createBoard({ THREE, canvas, onHexClick, onHexHover, onContextLost }) {
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive=true,contextLost=false,frame=0,last=performance.now(),dirty=true;
  function invalidate(shadows=false){if(!alive||contextLost)return;dirty=true;if(shadows)renderer.shadowMap.needsUpdate=true;if(!frame)frame=requestAnimationFrame(animate);}
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#182322');scene.fog=new THREE.Fog('#182322',32,65);
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);
  const focus=new THREE.Vector3(0,.35,0);let azimuth=.22,extent=7.4;
  const cameraPosition=()=>{camera.position.set(Math.sin(azimuth)*18,20,Math.cos(azimuth)*18);camera.lookAt(focus);};cameraPosition();
  const hemi=new THREE.HemisphereLight('#d4e3d8','#514534',2.3);scene.add(hemi);
  const sunlight=new THREE.DirectionalLight('#ffe1ab',3.5);sunlight.position.set(-7,14,8);sunlight.castShadow=true;sunlight.shadow.mapSize.set(1024,1024);sunlight.shadow.camera.left=-11;sunlight.shadow.camera.right=11;sunlight.shadow.camera.top=11;sunlight.shadow.camera.bottom=-11;sunlight.shadow.camera.near=.5;sunlight.shadow.camera.far=40;sunlight.shadow.bias=-.0007;sunlight.shadow.normalBias=.025;scene.add(sunlight);
  const rim=new THREE.DirectionalLight('#82abb8',2.1);rim.position.set(8,7,-9);scene.add(rim);
  let seed=7319;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const between=(a,b)=>a+random()*(b-a);
  const mat=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...options});
  const materials={stone:mat('#777b67'),stoneDark:mat('#515b4e'),gold:mat('#b99b59',{metalness:.65,roughness:.4}),wood:mat('#2d2920'),black:mat('#17201e'),steel:mat('#afb9af',{metalness:.7,roughness:.4}),leather:mat('#5b4935'),bone:mat('#c7bea1'),enemy:mat('#723e32'),blue:mat('#536b67'),cloth:mat('#c2bca2')};
  const addMesh=(geometry,material,parent=scene,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const textureLoader=new THREE.TextureLoader();
  const groundTexture=textureLoader.load('/assets/rocky-ground.jpg',()=>invalidate(true));groundTexture.colorSpace=THREE.SRGBColorSpace;groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;groundTexture.repeat.set(1.3,1.3);groundTexture.anisotropy=4;
  // Dark felt table with a subtle cartographer's circle underneath the board.
  const table=addMesh(new THREE.PlaneGeometry(150,150),mat('#17221f'),scene,0,-.88,0);table.rotation.x=-Math.PI/2;
  const ornament=new THREE.Group();scene.add(ornament);
  const makeCircle=(radius,y,color,opacity=1)=>{
    const geometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:129},(_,i)=>new THREE.Vector3(Math.cos(i/128*Math.PI*2)*radius,y,Math.sin(i/128*Math.PI*2)*radius)));
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));ornament.add(line);return line;
  };
  makeCircle(8.4,-.855,'#94845c',.2);makeCircle(8.55,-.855,'#94845c',.12);makeCircle(10.5,-.855,'#94845c',.08);
  for(let i=0;i<72;i++){
    const a=i/72*Math.PI*2,r=i%6?8.65:8.85;
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.sin(a)*8.45,-.85,Math.cos(a)*8.45),new THREE.Vector3(Math.sin(a)*r,-.85,Math.cos(a)*r)]),new THREE.LineBasicMaterial({color:'#a08d64',transparent:true,opacity:.16}));ornament.add(line);
  }
  // Solid hexagonal tray, recessed beneath the individual terrain tiles.
  addMesh(new THREE.CylinderGeometry(7.45,7.55,.18,6),materials.gold,scene,0,-.61,0).rotation.y=Math.PI/6;
  addMesh(new THREE.CylinderGeometry(7.4,7.45,.45,6),materials.wood,scene,0,-.32,0).rotation.y=Math.PI/6;
  addMesh(new THREE.CylinderGeometry(7.42,7.4,.08,6),materials.gold,scene,0,-.08,0).rotation.y=Math.PI/6;
  addMesh(new THREE.CylinderGeometry(7.28,7.28,.07,6),materials.black,scene,0,-.025,0).rotation.y=Math.PI/6;
  const R=1.15;
  const xy=(q,r)=>({x:Math.sqrt(3)*(q+r/2)*R,z:1.5*r*R});
  const tiles=new Map(),clickMeshes=[],terrainPickMeshes=[],tokenPickMeshes=[],piecePickMeshes=[],tileGroup=new THREE.Group();scene.add(tileGroup);
  const hexGeometry=new THREE.CylinderGeometry(R*.96,R*.98,.34,6);
  const capGeometry=new THREE.CylinderGeometry(R*.95,R*.96,.075,6);
  const sideMaterial=mat('#494d3e',{map:groundTexture});
  const hexLine=(radius,color,y,opacity=1)=>{
    const points=Array.from({length:7},(_,i)=>new THREE.Vector3(Math.sin(i/6*Math.PI*2)*radius,y,Math.cos(i/6*Math.PI*2)*radius));
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity}));
  };
  const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.025,0,0,.025,0,0,0,.28,0,0,0,-.025,0,0,.025,0,.22,0],3));grassGeo.computeVertexNormals();
  const grass=new THREE.InstancedMesh(grassGeo,mat('#9b9d67',{side:THREE.DoubleSide}),1400);let grassN=0;
  const rockGeo=new THREE.DodecahedronGeometry(1,0),rocks=new THREE.InstancedMesh(rockGeo,materials.stone,160);let rockN=0;
  const dummy=new THREE.Object3D();
  for(let q=-3;q<=3;q++)for(let r=-3;r<=3;r++){
    if(Math.abs(q+r)>3)continue;
    const {x,z}=xy(q,r),key=`${q},${r}`;const y=between(.025,.105);
    const color=new THREE.Color().setHSL(between(.13,.18),between(.10,.19),between(.34,.44));
    if(q===0||r===0)color.set('#777a64');
    const topMaterial=mat(color,{map:groundTexture});
    const tile=addMesh(hexGeometry,[sideMaterial,topMaterial,sideMaterial],tileGroup,x,y,z);tile.userData={q,r,key};clickMeshes.push(tile);
    const cap=addMesh(capGeometry,topMaterial,tileGroup,x,y+.2,z);cap.userData={q,r,key};clickMeshes.push(cap);
    const edge=hexLine(R*.94,'#a9a082',y+.244,.27);edge.position.set(x,0,z);tileGroup.add(edge);
    const highlight=addMesh(new THREE.CylinderGeometry(R*.92,R*.92,.012,6),new THREE.MeshBasicMaterial({color:'#b7c3a8',transparent:true,opacity:.1,depthWrite:false}),tileGroup,x,y+.247,z);highlight.visible=false;highlight.castShadow=false;highlight.receiveShadow=false;
    const border=hexLine(R*.92,'#bd9d61',y+.263,1);border.position.set(x,0,z);tileGroup.add(border);border.visible=false;
    tiles.set(key,{q,r,x,z,y:y+.24,highlight,border,topMaterial,baseColor:color.clone(),edge});
    // Grass and rubble live at the perimeter so every center stays readable and traversable.
    const clumps=between(15,35)|0;
    for(let i=0;i<clumps&&grassN<1400;i++){
      const a=random()*Math.PI*2,d=between(.65,.96),gx=x+Math.sin(a)*d,gz=z+Math.cos(a)*d;
      dummy.position.set(gx,y+.245,gz);dummy.rotation.set(0,random()*6.28,between(-.2,.2));dummy.scale.setScalar(between(.5,1.5));dummy.updateMatrix();grass.setMatrixAt(grassN,dummy.matrix);grass.setColorAt(grassN,new THREE.Color().setHSL(between(.11,.19),.2,between(.35,.7)));grassN++;
    }
    for(let i=0;i<3&&rockN<160;i++){
      const a=random()*6.28,d=between(.76,.95),s=between(.04,.13);dummy.position.set(x+Math.sin(a)*d,y+.25,z+Math.cos(a)*d);dummy.rotation.set(random(),random(),random());dummy.scale.set(s*1.5,s*.8,s);dummy.updateMatrix();rocks.setMatrixAt(rockN++,dummy.matrix);
    }
  }
  grass.count=grassN;rocks.count=rockN;rocks.castShadow=true;scene.add(grass,rocks);
  // Crumbling corners, roots and shrine fragments give this encounter a specific place.
  const pillar=(q,r,angle,h)=>{
    const t=tiles.get(`${q},${r}`),x=t.x+Math.sin(angle)*.72,z=t.z+Math.cos(angle)*.72;
    addMesh(new THREE.BoxGeometry(.45,.12,.45),materials.stone,scene,x,t.y+.06,z);
    const p=addMesh(new THREE.CylinderGeometry(.14,.19,h,7),materials.stone,scene,x,t.y+.12+h/2,z);p.rotation.z=.05;
    addMesh(new THREE.BoxGeometry(.34,.13,.34),materials.stoneDark,scene,x,t.y+.13+h,z);
  };
  pillar(-3,0,4,.9);pillar(-3,1,4.2,.45);pillar(0,-3,3,1.15);pillar(1,-3,3.3,.6);pillar(3,-2,1.1,.7);
  const bushMat=mat('#536449');
  for(const [q,r,a] of [[-2,3,1],[-3,2,4],[2,1,1],[3,-3,3],[-1,-2,3]]){
    const t=tiles.get(`${q},${r}`);
    for(let j=0;j<3;j++){const bush=addMesh(new THREE.IcosahedronGeometry(.21,1),bushMat,scene,t.x+Math.sin(a)*.8+between(-.13,.13),t.y+.15,t.z+Math.cos(a)*.8+between(-.13,.13));bush.scale.set(1,.65,1);}
  }
  // A tiny extinguished campfire and fallen shield along the southern edge.
  const ct=tiles.get('0,3');
  for(let i=0;i<4;i++){const log=addMesh(new THREE.CylinderGeometry(.04,.05,.45,6),materials.wood,scene,ct.x+Math.sin(i)*.3,ct.y+.04,ct.z+.65);log.rotation.set(Math.PI/2,i*.8,0);}

  // Each region changes the physical scenery as well as the light. Decorations stay
  // outside tile centers: the visible board always matches the movement rules.
  const regionProps=[new THREE.Group(),new THREE.Group(),new THREE.Group()];
  regionProps.forEach(g=>scene.add(g));
  const arcane=mat('#a89bc5',{emissive:'#6d488c',emissiveIntensity:.9,metalness:.3});
  const keepStone=mat('#62656a'),bannerMaterial=mat('#722d3a',{side:THREE.DoubleSide});
  for(const side of [-1,1]){
    addMesh(new THREE.CylinderGeometry(.38,.5,.25,6),materials.stoneDark,regionProps[1],side*4.2,.03,-6.25);
    const crystal=addMesh(new THREE.OctahedronGeometry(.42,0),arcane,regionProps[1],side*4.2,.7,-6.25);crystal.scale.y=1.55;
    addMesh(new THREE.CylinderGeometry(.34,.4,1.9,8),materials.stone,regionProps[1],side*1.5,.8,-7.05);
    addMesh(new THREE.BoxGeometry(.8,.2,.65),materials.stoneDark,regionProps[1],side*1.5,1.82,-7.05);
    const tower=addMesh(new THREE.BoxGeometry(.95,2.3,.8),keepStone,regionProps[2],side*4.05,.78,-6.55);
    for(let n=-1;n<=1;n++)addMesh(new THREE.BoxGeometry(.19,.35,.8),keepStone,regionProps[2],side*4.05+n*.3,2.08,-6.55);
    addMesh(new THREE.BoxGeometry(1.6,1.2,.4),keepStone,regionProps[2],side*2.7,.25,-7.15);
    addMesh(new THREE.CylinderGeometry(.15,.2,2.25,7),keepStone,regionProps[2],side*1.55,.78,-7.1);
    const banner=addMesh(new THREE.PlaneGeometry(.55,1.05),bannerMaterial,regionProps[2],side*4.05,1.02,-6.11);
    banner.rotation.z=side*.05;
    addMesh(new THREE.OctahedronGeometry(.085),materials.gold,regionProps[2],side*4.05,1.13,-6.08);
  }
  addMesh(new THREE.BoxGeometry(3.55,.3,.65),materials.stoneDark,regionProps[1],0,1.95,-7.05);
  const halo=addMesh(new THREE.TorusGeometry(.78,.035,6,48),new THREE.MeshBasicMaterial({color:'#bb9fe2',transparent:true,opacity:.65}),regionProps[1],0,.9,-7.1);
  const shrineGem=addMesh(new THREE.OctahedronGeometry(.24),arcane,regionProps[1],0,.95,-7.08);shrineGem.rotation.z=.18;
  addMesh(new THREE.BoxGeometry(3.45,.4,.75),keepStone,regionProps[2],0,2.02,-7.1);
  for(const side of [-1,1]){
    addMesh(new THREE.CylinderGeometry(.09,.12,.75,6),materials.black,regionProps[2],side*3.3,.25,-6.25);
    const ember=addMesh(new THREE.OctahedronGeometry(.16),new THREE.MeshBasicMaterial({color:'#e7a276'}),regionProps[2],side*3.3,.72,-6.25);ember.scale.y=1.8;
  }
  const themes=[
    {background:'#182322',table:'#17221f',sun:'#ffe1ab',rim:'#82abb8',ground:null,edge:'#a9a082'},
    {background:'#1e1b2a',table:'#211f2b',sun:'#ded3f5',rim:'#a58cde',ground:'#858095',edge:'#a99abd'},
    {background:'#211c20',table:'#251e20',sun:'#d6deed',rim:'#ba666b',ground:'#78818b',edge:'#ad8c88'}
  ];
  let environment=-1;
  function setEnvironment(index){
    if(environment===index)return;
    environment=Math.min(2,Math.max(0,index||0));const theme=themes[environment];
    scene.background.set(theme.background);scene.fog.color.set(theme.background);table.material.color.set(theme.table);
    sunlight.color.set(theme.sun);rim.color.set(theme.rim);hemi.color.set(environment===0?'#d4e3d8':'#d8d9ec');
    for(const t of tiles.values()){
      t.topMaterial.color.copy(t.baseColor);
      if(theme.ground)t.topMaterial.color.lerp(new THREE.Color(theme.ground),.72);
      t.edge.material.color.set(theme.edge);
    }
    grass.material.color.set(environment===0?'#9b9d67':environment===1?'#88859a':'#97928c');
    bushMat.color.set(environment===0?'#536449':environment===1?'#56516f':'#515861');
    regionProps.forEach((g,i)=>g.visible=i===environment);
    invalidate(true);
  }

  const pieces=new Map(),effects=[];let currentState=null;
  // Terrain and objectives are physical components on the hexes. They never
  // change the underlying raycast grid or block a walkable tile center.
  let terrainSignature='',tokenEncounter=-1;
  const terrainGroup=new THREE.Group();scene.add(terrainGroup);
  const tokenPieces=new Map();
  const markInteractive=(group,q,r,picks)=>group.traverse(object=>{
    if(object.isMesh||object.isSprite){object.userData={...object.userData,q,r,key:`${q},${r}`};picks.push(object);}
  });
  function groundDecal(symbol,color,parent,radius=.25){
    const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');
    ctx.fillStyle='rgba(17,28,28,.8)';ctx.beginPath();ctx.arc(64,64,60,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=6;ctx.lineJoin='round';
    if(symbol==='shield'){
      ctx.beginPath();ctx.moveTo(64,21);ctx.lineTo(96,35);ctx.lineTo(93,72);ctx.quadraticCurveTo(84,96,64,109);ctx.quadraticCurveTo(44,96,35,72);ctx.lineTo(32,35);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(64,39);ctx.lineTo(64,84);ctx.stroke();
    }else{
      ctx.beginPath();ctx.moveTo(64,22);ctx.lineTo(106,98);ctx.lineTo(22,98);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(64,48);ctx.lineTo(64,71);ctx.stroke();ctx.beginPath();ctx.arc(64,84,4,0,Math.PI*2);ctx.fill();
    }
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const disc=new THREE.Mesh(new THREE.PlaneGeometry(radius*2,radius*2),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    disc.rotation.x=-Math.PI/2;disc.position.y=.035;disc.renderOrder=3;parent.add(disc);return disc;
  }
  function terrainMarker(data){
    const group=new THREE.Group(),tile=tiles.get(`${data.q},${data.r}`);if(!tile)return null;
    group.position.set(tile.x,tile.y+.02,tile.z);terrainGroup.add(group);
    if(data.type==='cover'){
      const stone=mat(environment===2?'#788895':'#859580');
      // Three chipped blocks form a broken breastwork at the back of the hex.
      for(let i=-1;i<=1;i++){
        const block=addMesh(new THREE.BoxGeometry(.31,.29+Math.abs(i)*.07,.20),stone,group,i*.33,.16,-.7+Math.abs(i)*.09);
        block.rotation.y=-i*.17;block.rotation.z=i*.04;
        addMesh(new THREE.BoxGeometry(.33,.06,.23),materials.stoneDark,group,i*.33,.34+Math.abs(i)*.025,-.7+Math.abs(i)*.09);
      }
      const emblem=groundDecal('shield','#b6dcd0',group,.26);emblem.position.z=.32;
      const edge=hexLine(R*.88,'#7eafa0',.065,.7);group.add(edge);
    }else if(data.type==='hazard'){
      const crackColor=environment===1?'#eb88b7':'#ef8a57';
      const dark=new THREE.Mesh(new THREE.CircleGeometry(.65,6),new THREE.MeshBasicMaterial({color:'#2e2228',transparent:true,opacity:.65,depthWrite:false}));dark.rotation.x=-Math.PI/2;dark.position.y=.014;group.add(dark);
      const paths=[[-.72,.15,-.30,.05,-.1,-.3,.22,-.43,.64,-.32],[-.35,.63,-.25,.26,-.30,.05],[-.1,-.3,-.25,-.63],[.18,.44,.22,.08,.58,.0,.85,.19]];
      for(const path of paths){
        const points=[];for(let i=0;i<path.length;i+=2)points.push(new THREE.Vector3(path[i],.028,path[i+1]));
        const crack=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:crackColor,transparent:true,opacity:.92}));group.add(crack);
      }
      for(const [x,z] of [[-.59,-.28],[.52,.40]]){
        addMesh(new THREE.CylinderGeometry(.075,.12,.09,5),materials.black,group,x,.045,z);
        const ember=addMesh(new THREE.OctahedronGeometry(.085),new THREE.MeshBasicMaterial({color:crackColor}),group,x,.19,z);ember.scale.set(.65,1.6,.65);ember.castShadow=false;
      }
      const emblem=groundDecal('hazard','#f0ac80',group,.23);emblem.position.z=.1;
      group.add(hexLine(R*.88,crackColor,.058,.6));
    }
    markInteractive(group,data.q,data.r,terrainPickMeshes);return group;
  }
  function updateTerrain(state){
    const signature=JSON.stringify([environment,(state.terrain||[]).map(t=>[t.q,t.r,t.type])]);
    if(signature===terrainSignature)return;
    terrainSignature=signature;terrainPickMeshes.length=0;
    for(const child of [...terrainGroup.children]){terrainGroup.remove(child);disposeGroup(child,true);}
    for(const data of state.terrain||[])terrainMarker(data);
    invalidate(true);
  }
  function makeToken(data){
    const tile=tiles.get(`${data.q},${data.r}`);if(!tile)return null;
    const group=new THREE.Group();group.position.set(tile.x,tile.y+.035,tile.z);scene.add(group);
    const color=data.type==='skyshard'?'#8ee1f1':data.type==='ward'?'#cb9de9':'#e9c77b';
    const ring=addMesh(new THREE.TorusGeometry(.44,.025,5,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85}),group,0,.035,0);ring.rotation.x=Math.PI/2;ring.castShadow=false;
    const body=new THREE.Group();group.add(body);
    if(data.type==='skyshard'){
      addMesh(new THREE.CylinderGeometry(.21,.30,.12,6),materials.stoneDark,body,0,.09,0);
      const crystal=addMesh(new THREE.OctahedronGeometry(.25,0),new THREE.MeshStandardMaterial({color:'#b4edf1',emissive:'#45b5c7',emissiveIntensity:1.7,metalness:.35,roughness:.22}),body,0,.55,0);crystal.scale.set(.72,1.8,.72);crystal.rotation.y=.3;
      const glow=addMesh(new THREE.OctahedronGeometry(.32,0),new THREE.MeshBasicMaterial({color:'#86e0f3',transparent:true,opacity:.10,depthWrite:false}),body,0,.55,0);glow.scale.copy(crystal.scale);glow.castShadow=false;
      for(let i=0;i<3;i++){const shard=addMesh(new THREE.OctahedronGeometry(.055),new THREE.MeshBasicMaterial({color:'#bceef3'}),body,Math.sin(i*2.1)*.25,.21+Math.cos(i)*.04,Math.cos(i*2.1)*.25);shard.scale.y=1.6;shard.castShadow=false;}
    }else if(data.type==='ward'){
      addMesh(new THREE.CylinderGeometry(.31,.36,.11,8),materials.stoneDark,body,0,.07,0);
      const pillar=addMesh(new THREE.BoxGeometry(.28,.61,.28),mat('#575066'),body,0,.42,0);pillar.rotation.y=Math.PI/4;
      for(const side of [-1,1]){
        const rune=addMesh(new THREE.BoxGeometry(.035,.35,.03),new THREE.MeshBasicMaterial({color:'#d2a8f5'}),body,side*.11,.44,.13);rune.rotation.z=side*.18;rune.castShadow=false;
      }
      addMesh(new THREE.CylinderGeometry(.22,.2,.08,4),materials.steel,body,0,.75,0).rotation.y=Math.PI/4;
      const gem=addMesh(new THREE.OctahedronGeometry(.14),new THREE.MeshStandardMaterial({color:'#d3a0f1',emissive:'#9e4bbc',emissiveIntensity:1.5,roughness:.3}),body,0,.92,0);gem.scale.y=1.3;
    }else{
      addMesh(new THREE.BoxGeometry(.66,.31,.47),mat('#715237'),body,0,.22,0);
      addMesh(new THREE.BoxGeometry(.69,.14,.50),mat('#9b7546'),body,0,.43,0);
      for(const x of [-.22,.22])addMesh(new THREE.BoxGeometry(.055,.43,.51),materials.gold,body,x,.29,0);
      addMesh(new THREE.BoxGeometry(.1,.12,.055),materials.gold,body,0,.31,.27);
      addMesh(new THREE.BoxGeometry(.025,.055,.015),materials.black,body,0,.30,.305);
    }
    return {group,body,ring,data:{...data}};
  }
  function updateTokens(state){
    const valid=new Set((state.tokens||[]).filter(t=>!t.collected).map(t=>t.id));
    if(tokenEncounter!==state.encounter){
      for(const token of tokenPieces.values()){scene.remove(token.group);disposeGroup(token.group,true);}tokenPieces.clear();tokenEncounter=state.encounter;
    }
    for(const [id,token] of tokenPieces)if(!valid.has(id)){scene.remove(token.group);disposeGroup(token.group,true);tokenPieces.delete(id);}
    for(const data of state.tokens||[]){
      if(data.collected)continue;
      let token=tokenPieces.get(data.id);
      if(token&&(token.data.type!==data.type||token.data.q!==data.q||token.data.r!==data.r)){scene.remove(token.group);disposeGroup(token.group,true);tokenPieces.delete(data.id);token=null;}
      if(!token){token=makeToken(data);if(token)tokenPieces.set(data.id,token);}
      if(token)token.data={...data};
    }
    tokenPickMeshes.length=0;for(const token of tokenPieces.values())markInteractive(token.group,token.data.q,token.data.r,tokenPickMeshes);
  }
  const makeLabel=(name,health,maxHealth,isPlayer)=>{
    const c=document.createElement('canvas');c.width=320;c.height=112;const ctx=c.getContext('2d');
    ctx.fillStyle='rgba(10,18,18,.94)';ctx.beginPath();ctx.roundRect(7,7,306,96,10);ctx.fill();
    ctx.strokeStyle=isPlayer?'#c9bb85':'#bd806c';ctx.lineWidth=2;ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#f3edd8';ctx.font='600 29px Georgia';
    let short=name.length>19?name.slice(0,17)+'…':name;
    while(ctx.measureText(short).width>280)ctx.font=`600 ${parseInt(ctx.font.slice(4))-1}px Georgia`;
    ctx.fillText(short,160,43);
    ctx.fillStyle='#334339';ctx.fillRect(25,60,206,11);ctx.fillStyle=isPlayer?'#c5c992':'#d18e78';ctx.fillRect(25,60,206*Math.max(0,Math.min(1,health/Math.max(1,maxHealth))),11);
    ctx.font='500 24px Arial';ctx.textAlign='right';ctx.fillStyle='#e2ddc6';ctx.fillText(`${health}/${maxHealth}`,295,75);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
  };
  const makePiece=(data,isPlayer)=>{
    const group=new THREE.Group();scene.add(group);
    const figure=new THREE.Group();group.add(figure);
    const isBoss=/boss|captain|lord|daedra|warden/i.test(data.type+' '+data.name);
    const isArcher=/archer|ranger|bow/i.test(data.type+' '+data.name);
    const isMage=/mage|wraith|sorcerer|cultist|deslandra/i.test(data.type+' '+data.name+' '+(data.className||''));
    const isBeast=/beast|hound|wolf/i.test(data.type+' '+data.name);
    const faction=isPlayer?materials.blue:isBoss?mat('#553d55'):materials.enemy;
    addMesh(new THREE.CylinderGeometry(.48,.51,.13,32),materials.black,group,0,.07,0);
    const trim=addMesh(new THREE.TorusGeometry(.46,.035,7,40),isPlayer?materials.gold:mat('#a2614b',{metalness:.5}),group,0,.145,0);trim.rotation.x=Math.PI/2;
    addMesh(new THREE.CylinderGeometry(.425,.44,.035,32),mat(isPlayer?'#405b50':'#664338'),group,0,.15,0);
    figure.position.y=.18;
    const scale=isBoss?1.22:1;figure.scale.setScalar(scale);
    if(isBeast){
      const fur=mat('#55535d'),darkFur=mat('#34343e');
      const body=addMesh(new THREE.IcosahedronGeometry(.4,1),fur,figure,0,.46,0);body.scale.set(.72,.72,1.32);
      for(const side of [-1,1])for(const front of [-1,1]){
        const leg=addMesh(new THREE.CylinderGeometry(.055,.075,.34,5),fur,figure,side*.2,.2,front*.3);leg.rotation.x=front*.12;
        addMesh(new THREE.BoxGeometry(.12,.08,.18),darkFur,figure,side*.2,.04,front*.3+.04);
      }
      addMesh(new THREE.IcosahedronGeometry(.22,1),fur,figure,0,.64,.42);
      const muzzle=addMesh(new THREE.ConeGeometry(.13,.3,5),darkFur,figure,0,.61,.65);muzzle.rotation.x=Math.PI/2;
      for(const side of [-1,1]){
        const ear=addMesh(new THREE.ConeGeometry(.09,.22,4),fur,figure,side*.13,.86,.4);ear.rotation.z=-side*.16;
        addMesh(new THREE.SphereGeometry(.025,6,4),new THREE.MeshBasicMaterial({color:'#e2b976'}),figure,side*.17,.68,.54);
      }
      const tail=addMesh(new THREE.ConeGeometry(.11,.57,6),fur,figure,0,.63,-.52);tail.rotation.x=-.9;
    }else{
    // Boots and staggered legs create a readable, hand-sculpted stance.
    for(const side of [-1,1]){
      addMesh(new THREE.BoxGeometry(.16,.13,.25),materials.leather,figure,side*.13,.075,side*.045+.04);
      const leg=addMesh(new THREE.CylinderGeometry(.085,.07,.38,7),materials.steel,figure,side*.12,.29,side*.045);leg.rotation.z=-side*.08;
      addMesh(new THREE.SphereGeometry(.09,8,6),materials.gold,figure,side*.12,.34,.09);
    }
    addMesh(new THREE.CylinderGeometry(.22,.17,.41,8),isPlayer?materials.steel:faction,figure,0,.67,0);
    addMesh(new THREE.CylinderGeometry(.205,.23,.11,8),materials.leather,figure,0,.49,0);
    addMesh(new THREE.BoxGeometry(.11,.09,.04),materials.gold,figure,0,.51,.215);
    // Cape is a faceted, curved sheet rather than a flat rectangle.
    const capeGeo=new THREE.BufferGeometry();capeGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.22,.86,-.13,.22,.86,-.13,-.29,.25,-.27,-.29,.25,-.27,.22,.86,-.13,.29,.25,-.27,-.29,.25,-.27,.29,.25,-.27,0,.2,-.37],3));capeGeo.computeVertexNormals();
    addMesh(capeGeo,mat(isPlayer?'#698078':isBoss?'#4c334d':'#813d31',{side:THREE.DoubleSide}),figure);
    for(const side of [-1,1]){
      const shoulder=addMesh(new THREE.SphereGeometry(.14,8,6),isPlayer?materials.gold:materials.steel,figure,side*.25,.8,0);shoulder.scale.y=.7;
      const arm=addMesh(new THREE.CylinderGeometry(.075,.065,.3,7),materials.steel,figure,side*.29,.65,.03);arm.rotation.z=side*.22;
      addMesh(new THREE.SphereGeometry(.075,8,6),materials.leather,figure,side*.33,.51,.04);
    }
    addMesh(new THREE.CylinderGeometry(.06,.07,.1,7),materials.bone,figure,0,.92,0);
    const head=addMesh(new THREE.IcosahedronGeometry(.16,1),isMage?faction:materials.steel,figure,0,1.08,0);head.scale.set(.85,1.12,.9);
    if(!isMage){addMesh(new THREE.BoxGeometry(.19,.035,.035),materials.black,figure,0,1.08,.137);addMesh(new THREE.BoxGeometry(.035,.17,.035),materials.gold,figure,0,1.065,.15);}
    if(isPlayer||isBoss){const crest=addMesh(new THREE.BoxGeometry(.045,.12,.25),isPlayer?materials.gold:faction,figure,0,1.24,-.02);crest.rotation.x=.12;}
    if(isArcher){
      const bow=addMesh(new THREE.TorusGeometry(.3,.025,6,18,Math.PI),materials.wood,figure,.4,.65,.08);bow.rotation.z=-Math.PI/2;
      const string=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.4,.35,.08),new THREE.Vector3(.4,.95,.08)]),new THREE.LineBasicMaterial({color:'#d7c8a0'}));figure.add(string);
    } else if(isMage){
      addMesh(new THREE.CylinderGeometry(.024,.032,1.25,7),materials.wood,figure,.35,.65,.07);
      addMesh(new THREE.OctahedronGeometry(.12),new THREE.MeshStandardMaterial({color:'#91c4b3',emissive:'#4b9383',emissiveIntensity:1.3,roughness:.3}),figure,.35,1.32,.07);
    } else {
      const sword=new THREE.Group();sword.position.set(.36,.52,.07);sword.rotation.z=-.25;figure.add(sword);
      addMesh(new THREE.CylinderGeometry(.025,.025,.15,6),materials.leather,sword,0,.07,0);
      addMesh(new THREE.BoxGeometry(.23,.045,.07),materials.gold,sword,0,.18,0);
      const blade=addMesh(new THREE.ConeGeometry(.055,.67,4),materials.steel,sword,0,.52,0);blade.rotation.y=Math.PI/4;blade.scale.z=.5;
      const shield=addMesh(new THREE.CylinderGeometry(.22,.22,.055,8),faction,figure,-.36,.61,.12);shield.rotation.x=Math.PI/2;shield.scale.y=.9;
      const boss=addMesh(new THREE.SphereGeometry(.075,8,6),materials.gold,figure,-.36,.61,.16);boss.scale.z=.5;
    }
    }
    const labelMaterial=new THREE.SpriteMaterial({map:makeLabel(data.name||(isPlayer?'Your hero':'Enemy'),data.health,data.maxHealth,isPlayer),transparent:true,depthTest:false,depthWrite:false});
    const label=new THREE.Sprite(labelMaterial);label.position.y=isBoss?2.2:isBeast?1.57:1.93;label.scale.set(2.55,.893,1);label.renderOrder=8;group.add(label);
    const selection=addMesh(new THREE.TorusGeometry(.59,.038,7,40),new THREE.MeshBasicMaterial({color:'#e1c98a',transparent:true,opacity:.95}),group,0,.19,0);selection.rotation.x=-Math.PI/2;selection.visible=false;
    const wardAura=new THREE.Group();group.add(wardAura);wardAura.visible=false;
    for(const [radius,y] of [[.68,.22],[.54,1.12]]){
      const aura=new THREE.Mesh(new THREE.TorusGeometry(radius,.018,5,48),new THREE.MeshBasicMaterial({color:'#d7b3f4',transparent:true,opacity:.7,depthWrite:false}));aura.rotation.x=Math.PI/2;aura.position.y=y;wardAura.add(aura);
    }
    const shell=new THREE.Mesh(new THREE.SphereGeometry(.70,16,12),new THREE.MeshBasicMaterial({color:'#a57cc9',transparent:true,opacity:.075,depthWrite:false}));shell.position.y=.7;shell.scale.y=1.35;wardAura.add(shell);
    return {group,figure,label,selection,wardAura,data:{...data},isPlayer,target:new THREE.Vector3(),initialized:false,dying:0,lunge:null};
  };
  const hover=hexLine(R*.94,'#f1dfac',.28,.98);scene.add(hover);hover.visible=false;
  const selectedGlow=new THREE.PointLight('#d8c895',0,4,2);scene.add(selectedGlow);
  let selectedKey=null;
  function render(state){
    if(!alive||contextLost)return;
    const newRegion=environment!==Math.min(2,Math.max(0,state.encounter||0));
    if(newRegion){
      for(const effect of effects){scene.remove(effect.object);disposeGroup(effect.object);}effects.length=0;
      for(const [id,p] of pieces)if(p.dying){scene.remove(p.group);disposeGroup(p.group,true);pieces.delete(id);}
    }
    setEnvironment(state.encounter||0);currentState=state;updateTerrain(state);updateTokens(state);
    const combat=state.phase==='combat';
    const reachable=new Set((state.reachable||[]).map(h=>`${h.q},${h.r}`)),attackable=new Set((state.attackable||[]).map(h=>`${h.q},${h.r}`));
    const targetEnemy=(state.enemies||[]).find(e=>e.id===state.targetId&&e.health>0);
    selectedKey=combat&&state.mode==='attack'&&targetEnemy?`${targetEnemy.q},${targetEnemy.r}`:state.selected?`${state.selected.q},${state.selected.r}`:null;
    selectedGlow.intensity=0;
    for(const [key,t] of tiles){
      const selected=combat&&key===selectedKey,canMove=combat&&state.mode==='move'&&reachable.has(key),canAttack=combat&&state.mode==='attack'&&attackable.has(key);
      t.highlight.visible=selected||canMove||canAttack;t.border.visible=selected||canMove||canAttack;
      const color=selected?'#edce85':canAttack?'#de8979':'#d1c38a';
      t.highlight.material.color.set(color);t.highlight.material.opacity=selected?.3:canAttack?.22:.18;t.border.material.color.set(color);t.border.material.opacity=selected?1:.86;
      if(selected){selectedGlow.position.set(t.x,t.y+1,t.z);selectedGlow.intensity=.8;}
    }
    const roster=[];if(state.player)roster.push({...state.player,id:'player',isPlayer:true});for(const e of state.enemies||[])if(e.health>0)roster.push({...e,isPlayer:false});
    const ids=new Set(roster.map(p=>p.id));
    for(const [id,p] of pieces)if(!ids.has(id)&&!p.dying){p.dying=performance.now();if(reducedMotion){scene.remove(p.group);disposeGroup(p.group,true);pieces.delete(id);}}
    for(const data of roster){
      let piece=pieces.get(data.id);
      if(piece&&piece.data.className!==data.className){scene.remove(piece.group);disposeGroup(piece.group,true);pieces.delete(data.id);piece=null;}
      if(!piece){piece=makePiece(data,data.isPlayer);pieces.set(data.id,piece);}
      const t=tiles.get(`${data.q},${data.r}`);if(!t)continue;
      piece.target.set(t.x,t.y+.01,t.z);piece.dying=0;piece.group.scale.setScalar(1);
      if(!piece.initialized||newRegion||reducedMotion){piece.group.position.copy(piece.target);piece.initialized=true;}
      piece.figure.rotation.y=data.isPlayer?Math.PI:-.12;
      piece.selection.visible=combat&&(data.isPlayer?state.mode==='move':state.mode==='attack'&&data.id===state.targetId);
      piece.selection.material.color.set(data.isPlayer?'#d9d2a0':'#e7aa8d');
      piece.wardAura.visible=!data.isPlayer&&data.type==='boss'&&(state.tokens||[]).some(token=>token.type==='ward'&&!token.collected);
      if(piece.data.health!==data.health||piece.data.maxHealth!==data.maxHealth||piece.data.name!==data.name){piece.label.material.map.dispose();piece.label.material.map=makeLabel(data.name||(data.isPlayer?'Your hero':'Enemy'),data.health,data.maxHealth,data.isPlayer);piece.label.material.needsUpdate=true;}
      piece.data={...data};
    }
    piecePickMeshes.length=0;for(const piece of pieces.values())if(!piece.dying)markInteractive(piece.group,piece.data.q,piece.data.r,piecePickMeshes);
    invalidate(true);
  }
  function addEffect(object,duration,update,delay=0){scene.add(object);effects.push({object,start:performance.now()+delay,duration,update});object.visible=delay===0;invalidate();}
  function floatText(text,position,color,delay=0){
    const long=text.length>5,c=document.createElement('canvas');c.width=long?512:256;c.height=128;const ctx=c.getContext('2d');
    ctx.textAlign='center';ctx.textBaseline='middle';let fontSize=73;ctx.font=`700 ${fontSize}px Georgia`;
    while(ctx.measureText(text).width>c.width-30&&fontSize>26){fontSize--;ctx.font=`700 ${fontSize}px Georgia`;}
    ctx.lineJoin='round';ctx.lineWidth=7;ctx.strokeStyle='rgba(8,13,12,.9)';ctx.strokeText(text,c.width/2,61);ctx.fillStyle=color;ctx.fillText(text,c.width/2,61);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));sprite.scale.set(long?3.7:2.2,long?.925:1.1,1);sprite.renderOrder=25;
    const origin=position.clone();origin.y+=2.4;
    addEffect(sprite,reducedMotion?1000:1650,t=>{sprite.position.copy(origin);if(!reducedMotion)sprite.position.y+=t*.8;sprite.material.opacity=t>.8?(1-t)/.2:1;},delay);
  }
  function pulse(position,color,delay=0){
    const ring=new THREE.Mesh(new THREE.RingGeometry(.38,.49,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.copy(position);ring.position.y+=.17;ring.renderOrder=4;
    addEffect(ring,reducedMotion?350:620,t=>{ring.scale.setScalar(reducedMotion?1.5:1+t*2.5);ring.material.opacity=(1-t)*.9;},delay);
  }
  function projectile(from,to,color){
    if(reducedMotion)return;
    const bolt=new THREE.Group();
    bolt.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.14,1),new THREE.MeshBasicMaterial({color})));
    bolt.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.27,1),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.2,depthWrite:false})));
    const trail=new THREE.Mesh(new THREE.ConeGeometry(.1,.65,6),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5}));trail.rotation.x=-Math.PI/2;trail.position.z=.3;bolt.add(trail);
    const a=from.clone().add(new THREE.Vector3(0,1,0)),b=to.clone().add(new THREE.Vector3(0,1,0));
    addEffect(bolt,380,t=>{bolt.position.lerpVectors(a,b,t);bolt.position.y+=Math.sin(t*Math.PI)*.55;bolt.lookAt(b);});
  }
  function lunge(piece,toward){
    if(!piece||reducedMotion)return;
    const vector=toward.clone().sub(piece.target);vector.y=0;if(vector.lengthSq())vector.normalize().multiplyScalar(.38);
    piece.lunge={start:performance.now(),vector};invalidate();
  }
  function playEvent(event){
    if(!alive||contextLost||!event||!currentState)return;
    const hero=pieces.get('player'),target=pieces.get(event.targetId);
    if(event.type==='pickup'){
      const tile=tiles.get(`${event.q},${event.r}`),position=tile?new THREE.Vector3(tile.x,tile.y,tile.z):hero?.target;
      if(position){const color=event.tokenType==='skyshard'?'#a1eafa':event.tokenType==='ward'?'#deb9ff':'#efcf8c';pulse(position,color);floatText(event.tokenType==='chest'?`+${event.amount||15} GOLD`:event.tokenType==='ward'?'WARD BROKEN':'SKYSHARD',position,color);}
      return effects.length;
    }
    if(event.type==='enemy-defeated'){
      const piece=pieces.get(event.id);if(piece){piece.dying=performance.now()+(reducedMotion?0:420);piece.selection.visible=false;invalidate(true);}return;
    }
    if(['roll','ability'].includes(event.type)){
      const arcane=event.type==='ability'||event.dice?.some(d=>d.type==='magic');
      const color=arcane?'#dbc1ff':'#ffce97';
      if(target&&event.damage>0){
        if(hero){if(arcane)projectile(hero.target,target.target,color);else lunge(hero,target.target);}
        const delay=arcane&&!reducedMotion?320:0;
        pulse(target.target,color,delay);floatText(`−${event.damage}`,target.target,'#ffd3bd',delay);
      }
      const healing=event.healing||(event.dice||[]).filter(d=>d.face==='heal').reduce((sum,d)=>sum+(d.value||0),0);
      const guard=(event.dice||[]).filter(d=>d.face==='block').reduce((sum,d)=>sum+(d.value||0),0);
      if(hero&&healing){floatText(`+${healing}`,hero.target,'#ceecaa');pulse(hero.target,'#a9d68c');}
      else if(hero&&guard){floatText(`+${guard}`,hero.target,'#b8d8ee');pulse(hero.target,'#a7c6e5');}
      if(hero&&event.damage===0&&!healing&&!guard&&event.dice?.some(d=>d.face==='blank'))floatText('✦',hero.target,'#e6d49c');
    }
    if(event.type==='enemy-turn'&&hero){
      if(event.damage>0){pulse(hero.target,'#e39a86');floatText(`−${event.damage}`,hero.target,'#ffc4b1');const attacker=[...pieces.values()].find(p=>!p.isPlayer&&!p.dying);if(attacker)lunge(attacker,hero.target);}
      else{pulse(hero.target,'#a4c8d8');floatText('GUARD',hero.target,'#c7dee5');}
    }
    if(event.type==='heal'&&hero){floatText(`+${Math.min(6,Math.max(0,hero.data.maxHealth-hero.data.health))}`,hero.target,'#ceecaa');pulse(hero.target,'#a9d68c');}
    return effects.length;
  }
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const hitTest=(event)=>{const bounds=canvas.getBoundingClientRect();pointer.x=((event.clientX-bounds.left)/bounds.width)*2-1;pointer.y=-((event.clientY-bounds.top)/bounds.height)*2+1;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects([...clickMeshes,...terrainPickMeshes,...tokenPickMeshes,...piecePickMeshes],false);return hits[0]?.object.userData;};
  const keyboardFocus=hexLine(R*.84,'#b5e4ed',.30,1);scene.add(keyboardFocus);keyboardFocus.visible=false;
  let down=null,dragging=false,hoveredKey=null,focusedKey=null;
  const reportHover=key=>{const tile=tiles.get(key);if(onHexHover)onHexHover(tile?{q:tile.q,r:tile.r}:null);if(!reducedMotion){const token=[...tokenPieces.values()].find(t=>t.data.type==='skyshard'&&`${t.data.q},${t.data.r}`===key);if(token){token.spin=performance.now();invalidate();}}};
  function focusHex(q,r){
    const tile=tiles.get(`${q},${r}`);if(!tile)return false;
    focusedKey=`${q},${r}`;keyboardFocus.visible=true;keyboardFocus.position.set(tile.x,tile.y-.26,tile.z);reportHover(focusedKey);invalidate();return true;
  }
  function clearFocus(){focusedKey=null;keyboardFocus.visible=false;reportHover(hoveredKey);invalidate();}
  const releasePointer=()=>{if(down&&canvas.hasPointerCapture?.(down.id))canvas.releasePointerCapture?.(down.id);};
  const onDown=(event)=>{
    if(!alive||contextLost||event.button!==0)return;
    if(!event.isPrimary||down){onCancel();return;}
    down={id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY,startAngle:azimuth,gesture:'pending'};
    dragging=false;canvas.setPointerCapture?.(event.pointerId);
  };
  const onMove=(event)=>{
    if(!alive||contextLost)return;
    if(down){
      if(event.pointerId!==down.id)return;
      const dx=event.clientX-down.x,dy=event.clientY-down.y;
      if(down.gesture==='pending'&&Math.hypot(dx,dy)>6){
        dragging=true;
        down.gesture=down.type==='touch'&&Math.abs(dy)>=Math.abs(dx)?'scroll':'rotate';
      }
      if(down.gesture==='scroll')return;
      if(down.gesture==='rotate'){
        azimuth=down.startAngle-dx*.006;cameraPosition();hover.visible=false;canvas.style.cursor='grabbing';
        if(hoveredKey){hoveredKey=null;reportHover(focusedKey);}invalidate();return;
      }
    }
    const hit=hitTest(event);hover.visible=!!hit;canvas.style.cursor=hit?'pointer':'grab';if(hit){const t=tiles.get(hit.key);hover.position.set(t.x,t.y-.26,t.z);}if(hoveredKey!==hit?.key){hoveredKey=hit?.key||null;reportHover(hoveredKey||focusedKey);invalidate();}
  };
  const onUp=(event)=>{
    if(!down||event.pointerId!==down.id)return;
    const canClick=alive&&!contextLost&&!dragging&&down.gesture==='pending';
    releasePointer();down=null;dragging=false;canvas.style.cursor='grab';
    if(canClick){const hit=hitTest(event);if(hit&&onHexClick)onHexClick(hit.q,hit.r);}
  };
  function onCancel(){releasePointer();down=null;dragging=false;hover.visible=false;hoveredKey=null;reportHover(focusedKey);canvas.style.cursor='grab';invalidate();}
  const onLeave=()=>{hover.visible=false;hoveredKey=null;reportHover(focusedKey);invalidate();};
  function changeZoom(delta){if(!alive||contextLost)return false;const next=Math.max(6.5,Math.min(12,extent+delta));if(next===extent)return false;extent=next;resize();return true;}
  const zoomIn=()=>changeZoom(-.75),zoomOut=()=>changeZoom(.75);
  const onWheel=(event)=>{event.preventDefault();changeZoom(event.deltaY*.004);};
  function resetView(){if(!alive||contextLost)return;azimuth=.22;extent=7.4;cameraPosition();resize();}
  function handleContextLoss(event){
    event.preventDefault();if(!alive||contextLost)return;
    contextLost=true;cancelAnimationFrame(frame);frame=0;
    releasePointer();down=null;dragging=false;hoveredKey=null;focusedKey=null;
    hover.visible=false;keyboardFocus.visible=false;canvas.style.cursor='default';
    onHexHover?.(null);onContextLost?.();
  }
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onCancel);canvas.addEventListener('pointerleave',onLeave);canvas.addEventListener('wheel',onWheel,{passive:false});canvas.addEventListener('dblclick',resetView);canvas.addEventListener('webglcontextlost',handleContextLoss);canvas.style.touchAction='pan-y';
  let lastWidth=0,lastHeight=0;
  function resize(){if(!alive||contextLost)return;const bounds=canvas.getBoundingClientRect();const width=Math.max(1,bounds.width),height=Math.max(1,bounds.height),aspect=width/height;if(width!==lastWidth||height!==lastHeight){renderer.setSize(width,height,false);lastWidth=width;lastHeight=height;}camera.left=-extent*aspect;camera.right=extent*aspect;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix();invalidate();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  // Render a resting table only when something changes. Motion runs at most 30fps;
  // static shadows are reused, instead of redrawing an idle WebGL scene forever.
  function animate(now){
    frame=0;if(!alive||contextLost)return;
    if(now-last<32){frame=requestAnimationFrame(animate);return;}
    const dt=Math.min(.08,(now-last)/1000);last=now;let active=false;
    for(const [id,p] of pieces){
      if(p.dying){
        const t=Math.max(0,(now-p.dying)/430);active=true;
        if(t>=1||reducedMotion){scene.remove(p.group);disposeGroup(p.group,true);pieces.delete(id);renderer.shadowMap.needsUpdate=true;continue;}
        p.group.scale.setScalar(1-t*.75);p.group.position.y=p.target.y-t*.4;p.figure.rotation.z=-t*.8;p.label.material.opacity=1-t;
        renderer.shadowMap.needsUpdate=true;
      }else{
        if(p.group.position.distanceToSquared(p.target)>.00005){p.group.position.lerp(p.target,Math.min(1,dt*12));active=true;renderer.shadowMap.needsUpdate=true;}else p.group.position.copy(p.target);
        if(p.lunge){const t=(now-p.lunge.start)/360;if(t<1){p.figure.position.copy(p.lunge.vector).multiplyScalar(Math.sin(t*Math.PI));p.figure.position.y=.18;active=true;renderer.shadowMap.needsUpdate=true;}else{p.lunge=null;p.figure.position.set(0,.18,0);renderer.shadowMap.needsUpdate=true;}}
      }
    }
    for(const token of tokenPieces.values())if(token.spin){const t=(now-token.spin)/1100;active=true;if(t<1)token.body.rotation.y=Math.PI*2*(1-Math.pow(1-t,3));else{token.spin=0;token.body.rotation.y=0;}renderer.shadowMap.needsUpdate=true;}
    for(let i=effects.length-1;i>=0;i--){const e=effects[i],t=(now-e.start)/e.duration;active=true;if(t<0){e.object.visible=false;continue;}e.object.visible=true;if(t>=1){scene.remove(e.object);disposeGroup(e.object);effects.splice(i,1);continue;}e.update(t);}
    if(dirty||active){renderer.render(scene,camera);dirty=false;}
    if(active)frame=requestAnimationFrame(animate);
  }
  function disposeGroup(group,preserveShared=false){
    const shared=preserveShared?new Set(Object.values(materials)):new Set(),disposed=new Set();
    group.traverse(o=>{if(o.geometry&&!disposed.has(o.geometry)){o.geometry.dispose();disposed.add(o.geometry);}if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){if(shared.has(m)||disposed.has(m))continue;if(m.map&&m.map!==groundTexture&&!disposed.has(m.map)){m.map.dispose();disposed.add(m.map);}m.dispose();disposed.add(m);}}});
  }
  return {render,resize,playEvent,resetView,zoomIn,zoomOut,focusHex,clearFocus,dispose(){if(!alive)return;alive=false;cancelAnimationFrame(frame);frame=0;releasePointer();down=null;observer.disconnect();canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onCancel);canvas.removeEventListener('pointerleave',onLeave);canvas.removeEventListener('wheel',onWheel);canvas.removeEventListener('dblclick',resetView);canvas.removeEventListener('webglcontextlost',handleContextLoss);disposeGroup(scene);groundTexture.dispose();renderer.dispose();}};
}
