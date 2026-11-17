// three.js เฉพาะส่วนที่ 3D Avatar ใช้ (tree-shaken) -> public/vendor/eq-three.min.js  (โหลดแบบ lazy เฉพาะหน้า 3D)
// (v1.16.0: เหลือเฉพาะที่ Avatar Viewer ใช้)
//   npx esbuild scripts/avatar3d/three-entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=public/vendor/eq-three.min.js
export {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Color, Group, Vector3,
  AnimationMixer, LoopRepeat, LoopOnce, Skeleton, SRGBColorSpace, NeutralToneMapping, PMREMGenerator,
  MeshStandardMaterial, CircleGeometry, MeshBasicMaterial, Mesh, DataTexture, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter, Plane, Matrix4,
  // v1.16.0: EnglishQuest World ถูกนำออก — ตัด Fog/Vector2/AmbientLight/Ring/Sphere/BackSide/Box3/Blending ที่แผนที่ใช้ออก (ไฟล์เล็กลง)
  Quaternion,
} from 'three';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
