// v1.27.0 World Raid — three.js เฉพาะส่วนที่ฉากบอสใช้ (tree-shaken · โหลดแบบ lazy เฉพาะหน้า Raid · แยกจากชุดของ Avatar)
//   npx esbuild scripts/raid/three-raid-entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=public/vendor/eq-three-raid.min.js
export {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, AmbientLight, PointLight, Color, Group, Object3D, Vector3, Vector2, Quaternion, Euler, Matrix4,
  AnimationMixer, LoopRepeat, LoopOnce, SRGBColorSpace, ACESFilmicToneMapping, NeutralToneMapping, PCFSoftShadowMap, PMREMGenerator, FogExp2, Fog,
  MeshStandardMaterial, MeshBasicMaterial, PointsMaterial, SpriteMaterial, Mesh, Points, Sprite, BufferGeometry, BufferAttribute, Float32BufferAttribute,
  PlaneGeometry, CircleGeometry, RingGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, IcosahedronGeometry, TorusGeometry,
  CanvasTexture, AdditiveBlending, NormalBlending, DoubleSide, BackSide, FrontSide, MathUtils, Box3, Sphere, Clock,
} from 'three';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
