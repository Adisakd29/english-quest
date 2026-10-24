"""
EnglishQuest 3D Avatar — สร้างโมเดลจริงด้วย Blender (headless) ครบทุกชิ้นในแคตตาล็อก
  python  scripts/avatar3d/blender/build_avatar3d.py <outdir>     (bpy module: pip install bpy — Python 3.11)
  blender -b -P scripts/avatar3d/blender/build_avatar3d.py -- <outdir>
ผลลัพธ์ (<outdir>):
  EQ_Avatar_Master.blend   Template: ARM_Main · CHR_Base_01 · sockets · materials · ไฟ/กล้อง preview · Text ASSET_RULES
  EQ_Avatar_Items.blend    ไฟล์ต้นฉบับของทุก item (แยก collection ตามหมวด)
  glb/<ASSET>.glb          Base (มี animation) + item (skin กับ ARM_Main · AO bake ลง vertex color)
  thumbs/<ASSET>.png       ภาพย่อ 256×256 (Cycles · พื้นโปร่งใส)
  meta.json                triangles · materials · bones · slot · itemId
จากนั้น: node scripts/avatar3d/optimize.mjs <outdir>
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from eqlib import (BASE_VERSION, BONES, G_ARM_L, G_ARM_R, G_HIPS, G_LEG_L, G_LEG_R, G_TORSO, HEAD_C, HEAD_R, SOCKETS,  # noqa: E402
                   bake_ao, capsule, cut_below, ellipsoid, export_glb, flared, head_surface, heart_pts, join, make_animations,
                   make_armature, mat, prism, rbox, reset_scene, rrect_pts, set_body_sources, shell, skin, star_pts, tri_count,
                   body_samples, bvh_of, covered, HEAD_C as _HC, HEAD_C_W, HEAD_R_W, STYLE, style_warp,
                   tube_arc, tube_path, vertex_tint)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = os.path.abspath(argv[0] if argv else 'avatar3d_out')
ONLY = set(argv[1].split(',')) if len(argv) > 1 else None   # สร้างเฉพาะบาง asset (ทดสอบเร็ว)
os.makedirs(os.path.join(OUT, 'glb'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'thumbs'), exist_ok=True)

reset_scene()
ARM = make_armature()
make_animations(ARM)
RY = lambda deg: Matrix.Rotation(math.radians(deg), 3, 'Y')
RX = lambda deg: Matrix.Rotation(math.radians(deg), 3, 'X')
RZ = lambda deg: Matrix.Rotation(math.radians(deg), 3, 'Z')

def face_rot(n):
    return Vector((0, -1, 0)).rotation_difference(n).to_matrix()

# =====================================================================
# CHR_Base_01 — Style v3 หัวโตตัวเล็ก (ปั้นในพิกัดต้นแบบ แล้วแปลงด้วย style_warp ใน eqlib) · ใบหน้าแยกเป็น item (face_*)
# =====================================================================
SKIN = mat('MAT_Skin', '#e8b48c', 0.55)          # runtime เปลี่ยนสีตาม Skin Tone ที่ผู้ใช้เลือก (ไม่ผูกเพศ/เชื้อชาติ)
M_SHIRT = mat('MAT_Base_Shirt', '#f4f4f6', 0.8)
M_SHORTS = mat('MAT_Base_Shorts', '#9aa1b0', 0.8)
M_SOCK = mat('MAT_Base_Sock', '#f4f4f6', 0.8)

def base_parts():
    """ชิ้นส่วน Base พร้อมป้ายกำกับ: eq_region = ส่วนร่างกายที่ซ่อนได้เมื่อเสื้อผ้าปิดทั้งหมด (Body Mask)
    · eq_src = กลุ่มผิวที่ใช้เป็นต้นแบบน้ำหนักให้เสื้อผ้า (Skin Weight Transfer)"""
    def tag(ob, region, *src):
        ob['eq_region'] = region; ob['eq_src'] = ','.join(src); ob['eq_body'] = True
        return ob
    P = [tag(ellipsoid('head', HEAD_C, HEAD_R, SKIN, ['Head'], seg=48, rings=26, rigid='Head'), 'core')]
    np_, nn = head_surface(0, 0.768, out=-0.007)
    P.append(tag(ellipsoid('nose', np_, (0.017, 0.013, 0.013), SKIN, ['Head'], seg=16, rings=10, rigid='Head', rot=face_rot(nn)), 'core'))
    for sx in (1, -1):
        P.append(tag(ellipsoid('ear', (0.199 * sx, 0.006, 0.785), (0.03, 0.022, 0.042), SKIN, ['Head'], seg=18, rings=12, rigid='Head'), 'core'))
        P.append(tag(ellipsoid('ear_in', (0.212 * sx, 0.0, 0.785), (0.012, 0.014, 0.024), SKIN, ['Head'], seg=12, rings=8, rigid='Head'), 'core'))
    P.append(tag(capsule('neck', (0, 0, 0.53), (0, 0, 0.64), 0.046, 0.046, SKIN, ['Chest', 'Neck', 'Head']), 'core', 'torso'))
    P.append(tag(capsule('torso', (0, 0, 0.32), (0, 0, 0.47), 0.112, 0.124, M_SHIRT, G_TORSO, seg=32, rings=16, flat=0.74), 'torso', 'torso'))
    P.append(tag(ellipsoid('hips', (0, 0, 0.255), (0.118, 0.086, 0.074), M_SHORTS, G_HIPS, seg=28, rings=14), 'hips', 'torso', 'hips', 'leg.L', 'leg.R'))
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        arm = G_ARM_L if sx > 0 else G_ARM_R
        leg = G_LEG_L if sx > 0 else G_LEG_R
        P.append(tag(capsule('uarm', (0.13 * sx, 0, 0.507), (0.168 * sx, 0, 0.395), 0.042, 0.038, SKIN, arm, seg=18), 'uarm', f'arm.{sd}'))
        P.append(tag(capsule('larm', (0.168 * sx, 0, 0.395), (0.186 * sx, 0, 0.278), 0.038, 0.034, SKIN, arm, seg=18), 'larm', f'arm.{sd}'))
        # มือกลม (สไตล์ v3: ไม่มีนิ้ว/นิ้วโป้ง) — ทรงกลมแป้นเล็กน้อย
        P.append(tag(ellipsoid('hand', (0.191 * sx, -0.003, 0.24), (0.041, 0.038, 0.042), SKIN, arm, seg=24, rings=14), 'core', f'arm.{sd}'))
        P.append(tag(capsule('short', (0.062 * sx, 0, 0.245), (0.063 * sx, 0, 0.195), 0.0495, 0.0485, M_SHORTS, leg, seg=18), 'hips', 'torso', 'hips', f'leg.{sd}'))
        P.append(tag(capsule('uleg', (0.062 * sx, 0, 0.24), (0.064 * sx, 0, 0.135), 0.047, 0.043, SKIN, leg, seg=18), 'uleg', 'torso', 'hips', f'leg.{sd}'))
        P.append(tag(capsule('lleg', (0.064 * sx, 0, 0.135), (0.066 * sx, 0, 0.055), 0.043, 0.038, SKIN, leg, seg=18), 'lleg', f'leg.{sd}'))
        P.append(tag(ellipsoid('foot', (0.066 * sx, -0.024, 0.031), (0.043, 0.066, 0.031), M_SOCK, leg, seg=20, rings=10), 'foot', f'leg.{sd}'))
    return P

def build_base():
    parts = base_parts()
    for p in parts:
        skin(p, ARM)
    # ต้นแบบน้ำหนักสำหรับเสื้อผ้า (สำเนาของผิว ที่ skin แล้ว)
    groups = {}
    for p in parts:
        for key in filter(None, p['eq_src'].split(',')):
            groups.setdefault(key, []).append(p)
    set_body_sources(groups)
    # รวมเป็นส่วนร่างกายตาม region (แต่ละ region = mesh แยกใน GLB → runtime ซ่อนส่วนที่เสื้อผ้าปิดมิดได้)
    regions = {}
    for p in parts:
        regions.setdefault(p['eq_region'], []).append(p)
    out = []
    for r in BODY_REGIONS:
        ob = join(f'BODY_{r}', regions[r], ARM, skinned=True)
        ob['eq_region'] = r
        for k in ('eq_region_tmp', 'eq_src', 'eq_body'):
            if k in ob:
                del ob[k]
        out.append(ob)
    return out

BODY_REGIONS = ['core', 'torso', 'hips', 'uarm', 'larm', 'uleg', 'lleg', 'foot']
BODY = build_base()
BASE = BODY[0]   # ชิ้นหลัก (หัว/มือ) — ใช้อ้างอิงเดิม

# =====================================================================
# FACES (ใบหน้า 4 แบบ) — ตา skin กับ Eye.L/R (กะพริบตาด้วย animation เดียวกัน) · ส่วนอื่นติด Head
# =====================================================================
M_WHITE = mat('MAT_Eye_White', '#fbfbff', 0.25)
M_IRIS = mat('MAT_Eye_Iris', '#3a2c4f', 0.25)
M_HI = mat('MAT_Eye_Highlight', '#ffffff', 0.2, emission='#ffffff')
M_BROW = mat('MAT_Brow', '#4a3328', 0.8)
M_MOUTH = mat('MAT_Mouth', '#8a3b3b', 0.55)
M_TONGUE = mat('MAT_Tongue', '#e57b84', 0.6)
M_BLUSH = mat('MAT_Blush', '#f3a5a0', 0.9)
M_LID = mat('MAT_Skin_Lid', '#e8b48c', 0.55)   # เปลือกตา: ย้อมสีตามผิว

def eye(sx, scale=1.0, iris_y=0.0):
    side = 'L' if sx > 0 else 'R'
    x = 0.072 * sx
    p, n = head_surface(x, 0.79, out=-0.004)
    ip, inn = head_surface(x, 0.786 + iris_y, out=0.005)
    hp, hn = head_surface(x + 0.009, 0.802 + iris_y, out=0.01)
    s = scale
    return [ellipsoid('white', p, (0.028 * s, 0.012, 0.036 * s), M_WHITE, ['Head'], seg=20, rings=12, rigid=f'Eye.{side}', rot=face_rot(n)),
            ellipsoid('iris', ip, (0.02 * s, 0.006, 0.026 * s), M_IRIS, ['Head'], seg=18, rings=10, rigid=f'Eye.{side}', rot=face_rot(inn)),
            ellipsoid('hi', hp, (0.007, 0.003, 0.008), M_HI, ['Head'], seg=10, rings=6, rigid=f'Eye.{side}', rot=face_rot(hn))]

def brow(sx, z=0.858, a0=62, a1=118, r=0.036, tilt=0):
    bp, _ = head_surface(0.075 * sx, z, out=0.003)
    ob = tube_arc('brow', (bp.x, bp.y, bp.z - r), r, 0.0065, math.radians(a0), math.radians(a1), M_BROW, ['Head'], seg=10, tseg=6, rigid='Head')
    if tilt:
        ob.data.transform(Matrix.Translation(bp) @ Matrix.Rotation(math.radians(tilt * sx), 4, 'Y') @ Matrix.Translation(-bp))
    return ob

def blush(sx, k=1.0):
    cp, cn = head_surface(0.118 * sx, 0.735, out=-0.003)
    return ellipsoid('blush', cp, (0.03 * k, 0.006, 0.016 * k), M_BLUSH, ['Head'], seg=14, rings=8, rigid='Head', rot=face_rot(cn))

def F_smile():
    mp, _ = head_surface(0, 0.718)
    return [*eye(1), *eye(-1), brow(1), brow(-1), blush(1), blush(-1),
            tube_arc('mouth', (0, mp.y + 0.004, 0.755), 0.034, 0.0075, math.radians(215), math.radians(325), M_MOUTH, ['Head'], seg=14, tseg=6, rigid='Head')]

def F_happy():
    parts = [brow(1, z=0.868), brow(-1, z=0.868), blush(1, 1.2), blush(-1, 1.2)]
    for sx in (1, -1):
        side = 'L' if sx > 0 else 'R'
        p, _ = head_surface(0.072 * sx, 0.79, out=0.004)
        parts.append(tube_arc('eye_closed', (p.x, p.y, 0.775), 0.026, 0.0075, math.radians(28), math.radians(152), M_IRIS, ['Head'], seg=12, tseg=6, rigid=f'Eye.{side}'))
    mp, mn = head_surface(0, 0.73, out=0.0)
    semi = [(math.cos(a) * 0.036, math.sin(a) * 0.03) for a in [math.pi + math.pi * i / 14 for i in range(15)]]
    parts.append(prism('mouth', semi, 0.008, (0, mp.y + 0.002, 0.742), M_MOUTH, ['Head'], rigid='Head', rot=face_rot(mn)))
    tp, tn = head_surface(0, 0.722, out=0.004)
    parts.append(ellipsoid('tongue', tp, (0.018, 0.004, 0.009), M_TONGUE, ['Head'], seg=12, rings=6, rigid='Head', rot=face_rot(tn)))
    return parts

def F_cool():
    parts = [*eye(1, iris_y=-0.004), *eye(-1, iris_y=-0.004), brow(1, z=0.852, a0=74, a1=106, r=0.06), brow(-1, z=0.852, a0=74, a1=106, r=0.06)]
    for sx in (1, -1):
        side = 'L' if sx > 0 else 'R'
        p, n = head_surface(0.072 * sx, 0.79, out=-0.002)
        lid = shell('lid', p, (0.032, 0.017, 0.04), lambda d: d.z > 0.12 and d.y < 0.25, M_LID, ['Head'], seg=20, rings=12, thick=0.002, rigid=f'Eye.{side}')
        parts.append(lid)
    mp, _ = head_surface(0.012, 0.722)
    parts.append(tube_arc('smirk', (0.014, mp.y + 0.004, 0.75), 0.03, 0.007, math.radians(232), math.radians(318), M_MOUTH, ['Head'], seg=12, tseg=6, rigid='Head'))
    return parts

def F_focused():
    parts = [*eye(1, scale=0.92), *eye(-1, scale=0.92), blush(1, 0.8), blush(-1, 0.8)]
    for sx in (1, -1):
        a, _ = head_surface(0.105 * sx, 0.866, out=0.004)
        b, _ = head_surface(0.045 * sx, 0.848, out=0.004)
        parts.append(capsule('brow', a, b, 0.0075, 0.0085, M_BROW, ['Head'], seg=8, rings=6, rigid='Head'))
    l, _ = head_surface(-0.018, 0.728, out=0.003)
    r_, _ = head_surface(0.018, 0.728, out=0.003)
    parts.append(capsule('mouth', l, r_, 0.0065, 0.0065, M_MOUTH, ['Head'], seg=8, rings=6, rigid='Head'))
    return parts

# =====================================================================
# ทรงผม · เสื้อผ้า · รองเท้า · ของตกแต่ง (v2) — โค้ดโมเดลอยู่ใน items_wear.py / items_head.py · ชิ้นส่วนมาตรฐานใน garments.py / eqdetail.py
# =====================================================================
from registry import ITEMS as _REG  # noqa: E402
from eqdetail import attach_fabric_preview, uv_triplanar  # noqa: E402

FACE_ITEMS = [('FACE_Smile_01', 'face_smile', 'face', F_smile, {}), ('FACE_Happy_01', 'face_happy', 'face', F_happy, {}),
              ('FACE_Cool_01', 'face_cool', 'face', F_cool, {}), ('FACE_Focused_01', 'face_focused', 'face', F_focused, {})]
ITEMS = FACE_ITEMS + _REG
OPTS = {a: o for a, _i, _s, _b, o in ITEMS}
ITEMS = [(a, i, s, b) for a, i, s, b, _o in ITEMS]
if ONLY:
    ITEMS = [x for x in ITEMS if x[0] in ONLY]
ATTACH = {'hair': 'SOCK_Head', 'glasses': 'SOCK_Head', 'headphones': 'SOCK_Head', 'hat': 'SOCK_Head', 'face': 'SOCK_Head', 'back': 'SOCK_Back', 'effect': 'Root'}
POST = {a: o['post'] for a, o in OPTS.items() if o.get('post')}

def collection(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c

def move_to(ob, coll):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)

# ---------- Lighting / camera preview ----------
def preview_rig():
    s = bpy.context.scene
    w = bpy.data.worlds.new('WRL_Preview')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.82, 0.86, 0.95, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.85
    s.world = w
    for name, energy, rot in (('LGT_Key', 3.2, (52, 0, -28)), ('LGT_Fill', 1.2, (65, 0, 40)), ('LGT_Rim', 2.0, (110, 0, 175))):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = [math.radians(a) for a in rot]
        s.collection.objects.link(lo)
    cd = bpy.data.cameras.new('CAM_Preview')
    cd.type = 'ORTHO'
    co = bpy.data.objects.new('CAM_Preview', cd)
    s.collection.objects.link(co)
    s.camera = co
    return co

CAM = preview_rig()

def frame(target_z, scale, yaw=22, pitch=6):
    a = math.radians(yaw)
    p = math.radians(pitch)
    d = 3.0
    pos = Vector((-math.sin(a) * d * math.cos(p), -math.cos(a) * d * math.cos(p), target_z + math.sin(p) * d))
    CAM.location = pos
    CAM.rotation_euler = (Vector((0, 0, target_z)) - pos).to_track_quat('-Z', 'Y').to_euler()
    CAM.data.ortho_scale = scale

TEXT_RULES = """EnglishQuest Avatar — Asset rules (ทุก item ต้องสร้างจาก EQ_Avatar_Master.blend)
Units: meters · Z-up · character faces -Y · origin (0,0,0) = floor between feet · height 1.0 m
Skeleton: ARM_Main (ห้ามแก้ชื่อ/ตำแหน่ง bone) · sockets SOCK_Head SOCK_Back SOCK_Spine SOCK_Hand_L SOCK_Hand_R
Naming: CHR_Base_01 · FACE_<Name>_NN · HAIR_<Style>_NN · TOP_<Name>_NN · BOT_<Name>_NN · SHOE_<Name>_NN · HAT_<Name>_NN · OUT_<Name>_NN
        ACC_Glasses_NN · ACC_Headphone_NN · ACC_<Name>_NN · BACK_<Name>_NN · FX_<Name>_NN · MAT_<Item>_<Part> · ANIM_<Clip>
        MAT_Skin* = ย้อมสีผิวตอน runtime
Skinning: เสื้อผ้า = Armature modifier (ARM_Main) + vertex groups ชื่อ bone · ของติดตัว = weight 1.0 ที่ bone ของ socket
Shading: Principled BSDF สีล้วน + AO bake ลง vertex color 'AO' (bake_ao) — ไม่ใช้ texture ก็ได้ · ถ้าใช้ 512/1024 · ห้าม 4K
Budgets (triangles): Base 10k-25k · Hair 2k-8k · Clothing 2k-8k/ชิ้น · Accessory <= 3k · Effect <= 3k
Export: glTF 2.0 Binary (.glb) · +Y up · Apply modifiers (ยกเว้น Armature) · Skins ON · vertex color ACTIVE · Animations: Base เท่านั้น
        จากนั้น node scripts/avatar3d/optimize.mjs (meshopt + quantize) · FBX ใช้ได้ระหว่าง production เท่านั้น
"""

def mats(ob):
    return sorted({m.name for m in ob.data.materials if m})

base_coll = collection('CHR_Base')
for _b in BODY:
    move_to(_b, base_coll)
move_to(ARM, base_coll)
for sock in SOCKETS:
    move_to(bpy.data.objects[sock], base_coll)
for _b in BODY:
    uv_triplanar(_b)
for _b in BODY:
    bake_ao(_b, visible=tuple(x for x in BODY if x is not _b), lift=0.55)

t = bpy.data.texts.new('ASSET_RULES')
t.write(TEXT_RULES)
bpy.context.scene['eq_base_version'] = BASE_VERSION
frame(0.5, 1.25, yaw=18, pitch=4)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'EQ_Avatar_Master.blend'), compress=True)

meta = {'baseVersion': BASE_VERSION, 'units': 'meters', 'up': '+Y (glTF)', 'forward': '+Z (glTF)',
        'bones': [b[0] for b in BONES], 'sockets': SOCKETS, 'base': None, 'items': []}
export_glb(os.path.join(OUT, 'glb', 'CHR_Base_01.glb'), [ARM, *BODY], animations=True)
meta['base'] = {'asset': 'CHR_Base_01', 'triangles': sum(tri_count(b) for b in BODY), 'materials': sorted({m for b in BODY for m in mats(b)}),
                'regions': BODY_REGIONS,
                'animations': [a.name for a in bpy.data.actions if a.name.startswith('ANIM_')]}
print('base', meta['base']['triangles'])

# ---------- Body Mask: ส่วนร่างกายที่เสื้อผ้าชิ้นนี้ปิดมิด (ท่าพัก) → runtime ซ่อน = ไม่มีผิวโผล่ทะลุแม้ผ้าบาง ----------
MASK_SLOTS = {'top', 'outerwear', 'bottom', 'shoes'}
CHECK_SLOTS = MASK_SLOTS | {'accessory', 'back'}
REGION_OB = {r['eq_region']: r for r in BODY}
def rest_pose():
    ARM.animation_data.action = None
    for trk in ARM.animation_data.nla_tracks:
        trk.mute = True
    for pb in ARM.pose.bones:
        pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
rest_pose()
_dg = bpy.context.evaluated_depsgraph_get()
REST_BODY = body_samples(BODY, _dg)
BODY_BVH, BODY_OWNER = bvh_of(BODY, _dg)
for trk in ARM.animation_data.nla_tracks:
    trk.mute = False

# ส่วนร่างกายที่ชิ้นแต่ละหมวด "ตั้งใจปิด" (ใช้ตรวจผิวโผล่ระหว่างขยับ) — ไม่นับมือที่บังเอิญอยู่ใกล้กระโปรง ฯลฯ
SLOT_REGIONS = {'top': ['torso', 'uarm', 'larm'], 'outerwear': ['torso', 'uarm', 'larm'], 'bottom': ['hips', 'uleg', 'lleg'],
                'shoes': ['foot', 'lleg'], 'accessory': ['larm', 'torso'], 'back': ['torso']}
def masks_for(ob, slot):
    rest_pose()
    dg = bpy.context.evaluated_depsgraph_get()
    ib, _ = bvh_of([ob], dg)
    masks, cov, idx = [], {}, {}
    for reg, pts in REST_BODY.items():
        if reg == 'core':
            continue
        ok = item = 0
        mine = []
        for i, (co, n) in enumerate(pts):
            c = covered(co, n, ib, BODY_BVH, BODY_OWNER, REGION_OB[reg])
            if c:
                ok += 1
            if c == 'item':
                item += 1
                mine.append(i)
        cov[reg] = round(ok / len(pts), 4)
        if reg in SLOT_REGIONS.get(slot, []) and slot in MASK_SLOTS and item / len(pts) >= 0.5:
            # "อยู่ใต้ผ้าชิ้นนี้" = ray โดนผ้าในระยะใกล้ และผ้าตรงจุดนั้นห่อส่วนร่างกายเดียวกัน (ไม่ใช่แขนที่แค่อยู่ข้างลำตัวเสื้อ)
            # และอยู่ลึกจากขอบผ้า ≥ 1.5 ซม. (ผิวที่โผล่จากปลายแขนเสื้อ/ขากางเกงเมื่อขยับ = ปกติ ไม่ใช่ทะลุ)
            from mathutils.kdtree import KDTree
            outside = [pts[i][0] for i in range(len(pts)) if i not in set(mine)]
            kd = KDTree(max(1, len(outside)))
            for k_, co_ in enumerate(outside):
                kd.insert(co_, k_)
            kd.balance()
            sel = []
            for i in mine:
                co, n = pts[i]
                h = ib.ray_cast(co + n * 0.0015, n, 0.06)
                if h[0] is None:
                    continue
                hb_ = BODY_BVH.ray_cast(co + n * 0.0015, n, h[3])
                if hb_[0] is not None and BODY_OWNER[hb_[2]] is not REGION_OB[reg]:
                    continue   # มีผิวส่วนอื่นบังก่อนถึงผ้า (เช่น ปลายแขนที่ซ่อนในข้อศอก)
                nb = BODY_BVH.find_nearest(h[0])
                if nb[0] is not None and BODY_OWNER[nb[2]] is REGION_OB[reg] and (not outside or kd.find(co)[2] > 0.015):
                    sel.append(i)
            idx[reg] = sel
        if ok / len(pts) >= 0.995 and item / len(pts) >= 0.15:
            masks.append(reg)
    for trk in ARM.animation_data.nla_tracks:
        trk.mute = False
    return masks, cov, idx

built = []
COVER_IDX = {}
for asset, item_id, slot, builder in ITEMS:
    ob = join(asset, builder(), ARM)
    uv_triplanar(ob)
    move_to(ob, collection(slot.upper()))
    # AO: เสื้อผ้า/รองเท้าคิดเงาจากตัวละครด้วย · ของบนหัว/เอฟเฟกต์คิดเฉพาะตัวเอง
    with_body = slot in ('top', 'bottom', 'outerwear', 'shoes', 'accessory', 'back', 'hair', 'hat')
    bake_ao(ob, visible=tuple(BODY) if with_body else (), lift=0.5 if slot != 'effect' else 0.8)
    if asset in POST:
        POST[asset](ob)
    export_glb(os.path.join(OUT, 'glb', f'{asset}.glb'), [ARM, ob], animations=False)
    masks, cov = [], {}
    if slot in CHECK_SLOTS:
        masks, cov, COVER_IDX[asset] = masks_for(ob, slot)
        if slot not in MASK_SLOTS:
            masks = []
    masks = sorted(set(masks) | set(OPTS.get(asset, {}).get('mask', [])))
    meta['items'].append({'asset': asset, 'itemId': item_id, 'slot': slot, 'triangles': tri_count(ob), 'materials': mats(ob),
                          'masks': masks, 'coverage': cov,
                          'bones': sorted({g.name for g in ob.vertex_groups}), 'attach': ATTACH.get(slot, 'skinned'), 'baseVersion': BASE_VERSION})
    built.append((asset, slot, ob))
    print(asset, tri_count(ob))

# ---------- ความเข้ากันได้ระหว่างชิ้น (ตรวจเรขาคณิตจริงทุกคู่) → rules ใน models.json (runtime แสดงเหตุผล + ถอดชิ้นที่ชนออก) ----------
def _verts(ob, step=1):
    dg = bpy.context.evaluated_depsgraph_get()
    from eqlib import _eval_mesh
    return [p for p, _n in _eval_mesh(ob, dg)][::step]

def poke_ratio(inner, outer, center, up_test=True, step=2, clip=None):
    """สัดส่วนจุดของ inner ที่ "ควรอยู่ใต้" outer แต่โผล่ออกนอก (เช่น ผมทะลุหมวก): จุดที่มี outer อยู่เหนือ (ray ขึ้นบนโดน outer)
    แต่ ray จากจุดศูนย์กลาง → ผ่านจุดนั้น ออกไปไม่โดน outer"""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    ob_bvh, _ = bvh_of([outer], dg)
    cand = poke = 0
    rim = None
    if up_test:
        # ขอบล่างของ "ทรงหมวก" (ไม่นับปีกหมวกที่กว้างออกไป) — ผมที่สูงกว่านี้ต้องอยู่ในหมวก
        crown = [q for q in _verts(outer, 1) if math.hypot(q.x - center.x, q.y - center.y) < 0.235 * KH]
        rim = min(q.z for q in crown) if crown else None
    for p in _verts(inner, step):
        if clip is not None and above_plane(p, clip):
            continue
        if up_test:
            if rim is None or (clip is None and p.z < rim + 0.012) or math.hypot(p.x - center.x, p.y - center.y) > 0.26 * KH:
                continue
            if ob_bvh.ray_cast(p, Vector((0, 0, 1)), 0.4)[0] is None:
                continue
        cand += 1
        d = (p - center)
        if d.length < 1e-6:
            continue
        h2 = ob_bvh.ray_cast(p + d.normalized() * 0.001, d.normalized(), 0.4)
        if h2[0] is None:
            poke += 1
    return (poke / cand if cand else 0.0), cand

def inside_ratio(a, b, center, step=2):
    """สัดส่วนจุดของ a ที่จมอยู่ "ใน" b (ray จาก center ผ่านจุดนั้นออกไปโดน b) — เช่น ก้านหูฟังอยู่ในเนื้อหมวก"""
    dg = bpy.context.evaluated_depsgraph_get()
    bb_, _ = bvh_of([b], dg)
    pts = _verts(a, step)
    n = 0
    for p in pts:
        d = (p - center)
        if d.length < 1e-6:
            continue
        if bb_.ray_cast(p + d.normalized() * 0.001, d.normalized(), 0.3)[0] is not None:
            n += 1
    return n / max(1, len(pts))

rest_pose()
by_slot = {}
for a, sl, o in built:
    by_slot.setdefault(sl, []).append((a, o))
ASSET_ITEM = {a: i for a, i, _s, _b in ITEMS}
NAME_TH = {}
compat = {}
def conflict(a1, a2, reason):
    compat.setdefault(a1, []).append({'with': ASSET_ITEM[a2], 'reason': reason})
    compat.setdefault(a2, []).append({'with': ASSET_ITEM[a1], 'reason': reason})
HEADC = style_warp((0, 0.0, 0.8), True)   # ศูนย์ศีรษะ (พิกัดจริงหลังแปลงสัดส่วน)
KH = STYLE['KH']
pair_log = []
HAT_CLIP = {}
def hat_clip_plane(hob):
    """ระนาบ "ขอบหมวก" (fit z = a + b·x + c·y จากจุดต่ำสุดของทรงหมวกในแต่ละมุม 24 ช่อง — รองรับหมวกเอียงอย่างเบเร่ต์)
    runtime ตัดผม/ก้านหูฟังส่วนที่อยู่ "เหนือ" ระนาบนี้ทิ้ง (ส่วนนั้นอยู่ในหมวก = มองไม่เห็นอยู่แล้ว) → ผมฟู/สูงไม่ทะลุหมวก
    คืน None ถ้าหมวกไม่ได้ครอบศีรษะ (ที่คาดผม/มงกุฎ) — ไม่ตัดอะไร"""
    dg = bpy.context.evaluated_depsgraph_get()
    hb, _ = bvh_of([hob], dg)
    if hb.ray_cast(HEADC, Vector((0, 0, 1)), 0.6)[0] is None:
        return None
    pts = [q for q in _verts(hob, 1) if math.hypot(q.x - HEADC.x, q.y - HEADC.y) < 0.235 * KH]
    bins = {}
    for q in pts:
        k = int((math.atan2(q.y, q.x) + math.pi) / (2 * math.pi) * 24) % 24
        if k not in bins or q.z < bins[k].z:
            bins[k] = q
    if len(bins) < 16:
        return None
    import numpy as np
    A = np.array([[1, q.x, q.y] for q in bins.values()]); z = np.array([q.z for q in bins.values()])
    sol = np.linalg.lstsq(A, z, rcond=None)[0]
    return [round(float(sol[0]) + 0.004, 4), round(float(sol[1]), 4), round(float(sol[2]), 4)]

def above_plane(p, pl):
    return p.z > pl[0] + pl[1] * p.x + pl[2] * p.y

for ha, hob in by_slot.get('hat', []):
    pl = hat_clip_plane(hob)
    if pl:
        HAT_CLIP[ha] = pl
    if pl:
        # หมวกครอบศีรษะ: ผม/ก้านหูฟังส่วนเหนือขอบหมวกถูกตัดที่ runtime → ไม่มีคู่ที่ชนกัน (ตรวจด้วยภาพ QA hat×hair)
        continue
    # หมวกที่ไม่ครอบ (ที่คาดผม/มงกุฎ) — วางทับผม: บันทึกค่าไว้ดูเท่านั้น (ตัวเลข ray วัดความ "จม" ไม่สอดคล้องกับภาพจริง — ภาพ QA ไม่พบการทะลุ)
    for ra, rob in by_slot.get('hair', []):
        r = inside_ratio(hob, rob, HEADC)
        pair_log.append((ha, ra, round(r, 3), 0))
for pa, pob in by_slot.get('headphones', []):
    for ra, rob in by_slot.get('hair', []):
        r = inside_ratio(pob, rob, HEADC)
        pair_log.append((pa, ra, round(r, 3), 0))
        # เกณฑ์ปรับจากภาพ QA: ผมยาว (0.53) ก้าน+ครอบหูยังเห็นชัด → ชนจริงเมื่อจมเกิน 70%
        if r > 0.7:
            conflict(pa, ra, 'ทรงผมนี้หนา/สูงจนก้านหูฟังจมในผม')
for ba, bob in by_slot.get('back', []):
    for oa, oob in by_slot.get('outerwear', []):
        r, cand = poke_ratio(oob, bob, style_warp((0, 0, 0.42)), up_test=False)
        # เฉพาะผ้าคลุม (shell ด้านหลัง) — กระเป๋า/ของแข็งวางทับเสื้อคลุมได้
        if 'Cape' in ba:
            back_pts = [p for p in _verts(oob, 3) if p.y > 0.05 * STYLE['KX'] and 0.2 * STYLE['KB'] < p.z < 0.55 * STYLE['KB']]
            dg_ = bpy.context.evaluated_depsgraph_get()
            cb, _ = bvh_of([bob], dg_)
            out_ = sum(1 for p in back_pts if cb.ray_cast(p, Vector((p.x, p.y, 0)).normalized(), 0.3)[0] is None)
            rr = out_ / max(1, len(back_pts))
            pair_log.append((ba, oa, round(rr, 3), len(back_pts)))
            # บันทึกค่าไว้ดูเท่านั้น: ภาพ QA (ผ้าคลุม × เสื้อพัฟเฟอร์ที่หนาที่สุด ทุกท่า) ไม่พบเสื้อทะลุผ้าคลุม — ray แนวนอนนับขอบข้างลำตัวเกิน
meta['compat'] = {ASSET_ITEM[a]: v for a, v in compat.items()}
meta['hatClip'] = {ASSET_ITEM[a]: v for a, v in HAT_CLIP.items()}
print('HATCLIP', meta['hatClip'])
print('COMPAT', json.dumps(meta['compat'], ensure_ascii=False)[:3000])
print('PAIRS', [x for x in pair_log if x[2] > 0.02][:80])

# ---------- Animation Regression (ใน Blender): ทุกชิ้นที่ใส่บนตัว × ทุกคลิป × หลายเฟรม ----------
CLIPS = [('ANIM_Idle', [1, 25, 41, 73]), ('ANIM_Blink', [4]), ('ANIM_Wave', [8, 15, 22, 29]), ('ANIM_RaiseArmL', [10, 20]), ('ANIM_RaiseArmR', [10, 20]),
         ('ANIM_BothArmsUp', [10, 20]), ('ANIM_Turn', [16, 31, 46]), ('ANIM_Celebrate', [6, 12, 18]), ('ANIM_Victory', [8, 14, 30]),
         ('ANIM_Defeat', [14, 40]), ('ANIM_Walk', [1, 5, 9, 13, 17, 21, 25, 29]),
         ('ANIM_Run', [1, 4, 7, 10, 13, 16, 19, 22]), ('ANIM_Sit', [1, 24])]
HAND_IDX = []
_core = REGION_OB['core']
_gi = {g.index: g.name for g in _core.vertex_groups}
for v in _core.data.vertices:
    if sum(g.weight for g in v.groups if _gi[g.group].startswith(('Hand', 'LowerArm'))) > 0.5:
        HAND_IDX.append(v.index)

def pose_frame(clip, f):
    ARM.animation_data.action = None
    for trk in ARM.animation_data.nla_tracks:
        trk.mute = trk.name != clip
    for pb in ARM.pose.bones:
        pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()
    return bpy.context.evaluated_depsgraph_get()

def bone_rest_to_pose(name):
    pb = ARM.pose.bones[name]
    return ARM.matrix_world @ pb.matrix @ ARM.data.bones[name].matrix_local.inverted()

def limb_penetration(samples):
    """แขน/มือเข้าไปในหัว (ellipsoid) หรือลำตัว (capsule) — นับจุด"""
    head_inv = bone_rest_to_pose('Head').inverted()
    chest_inv = bone_rest_to_pose('Chest').inverted()
    spine_inv = bone_rest_to_pose('Spine').inverted()
    pts = [co for co, _ in samples['uarm']] + [co for co, _ in samples['larm']] + [samples['core'][i][0] for i in HAND_IDX]
    head = torso = 0
    for co in pts:
        q = head_inv @ co
        d = Vector(((q.x - HEAD_C_W.x) / HEAD_R_W.x, (q.y - HEAD_C_W.y) / HEAD_R_W.y, (q.z - HEAD_C_W.z) / HEAD_R_W.z))
        if d.length < 0.97:
            head += 1
        for inv, z0, z1 in ((chest_inv, 0.40 * STYLE['KB'], 0.47 * STYLE['KB']), (spine_inv, 0.30 * STYLE['KB'], 0.40 * STYLE['KB'])):
            q = inv @ co
            if z0 <= q.z <= z1 and math.hypot(q.x, q.y / 0.74) < 0.1 * STYLE['KX']:
                torso += 1
                break
    return head, torso

validation = {'clips': [c for c, _ in CLIPS], 'items': {}, 'poses': {}}
POKE_SLOTS = ('top', 'outerwear', 'bottom', 'shoes')
ITEM_MASKS = {it['asset']: set(it.get('masks') or []) for it in meta['items']}
checked = [(a, sl, o) for a, sl, o in built if a in COVER_IDX]
head_items = [(a, sl, o) for a, sl, o in built if sl in ('hair', 'hat', 'headphones', 'glasses', 'face') and a not in COVER_IDX]
for clip, frames in CLIPS:
    for f in frames:
        dg = pose_frame(clip, f)
        smp = body_samples(BODY, dg)
        bb, bo = bvh_of(BODY, dg)
        h, t = limb_penetration(smp)
        OTHER_BVH = {REGION_OB[k].get('eq_region'): bvh_of([o for o in BODY if o is not REGION_OB[k]], dg) for k in REGION_OB}
        validation['poses'][f'{clip}@{f}'] = {'armInHead': h, 'armInTorso': t}
        # ของบนหัว (ผม/หมวก/หูฟัง/แว่น/หน้า): นับจุดของแขน+มือที่เข้าไป "ใน" เนื้อชิ้น (ยกแขน/โบกมือผ่านปีกหมวก ผมฟู)
        arm_pts = [co for co, _ in smp['uarm']] + [co for co, _ in smp['larm']] + [smp['core'][i][0] for i in HAND_IDX]
        for asset, slot, ob in head_items:
            hb_, _ = bvh_of([ob], dg)
            n_in = 0
            for co in arm_pts:
                q_, nq_, _i, d_ = hb_.find_nearest(co, 0.05)
                if q_ is not None and (co - q_).dot(nq_) < -0.002:
                    n_in += 1
            r = validation['items'].setdefault(asset, {'worst': 0.0, 'worstAt': None, 'clips': {}, 'regions': {}, 'sink': 0.0, 'limb': 0.0})
            q = round(n_in / max(1, len(arm_pts)), 4)
            if q > r.get('limb', 0.0):
                r['limb'] = q; r['limbAt'] = f'{clip}@{f}'
        for asset, slot, ob in checked:
            ib, _ = bvh_of([ob], dg)
            tot = exp = 0
            for reg, ids in COVER_IDX[asset].items():
                if reg in OPTS.get(asset, {}).get('mask', []):
                    continue   # ส่วนที่ชิ้นนี้แทนที่เอง (เช่น เท้าในรองเท้าแตะ) — ซ่อนไว้แล้ว
                pts = smp[reg]
                e0 = exp
                for i in ids:
                    tot += 1
                    co, n = pts[i]
                    if covered(co, n, ib, bb, bo, REGION_OB[reg], dist=0.12) is None:
                        exp += 1
                if exp > e0:
                    rr = r_reg = validation['items'].setdefault(asset, {'worst': 0.0, 'worstAt': None, 'clips': {}, 'regions': {}})['regions']
                    rr[reg] = max(rr.get(reg, 0), round((exp - e0) / max(1, len(ids)), 4))
            r = validation['items'].setdefault(asset, {'worst': 0.0, 'worstAt': None, 'clips': {}, 'regions': {}, 'sink': 0.0})
            if slot in POKE_SLOTS:
                # ผิวทะลุผ้า: จุดบนร่างกาย (ส่วนที่ยังแสดงอยู่) ที่ "อยู่นอก" ผิวด้านนอกของผ้า (ภายใน 3 ซม.)
                #   (ตรวจได้แม้ท่าพัก — ต่างจาก exposure ที่ดูเฉพาะส่วนที่เคยถูกปิดแล้วโผล่)
                pk = r.setdefault('poke', 0.0)
                for reg in SLOT_REGIONS.get(slot, []):
                    # เฉพาะส่วนที่ชิ้นนี้ "ห่อ" อยู่จริง (เหมือน exposure) · ส่วนที่ถูกซ่อน (mask) ไม่ต้องตรวจ
                    if reg not in COVER_IDX[asset] or reg in ITEM_MASKS.get(asset, ()) or reg in OPTS.get(asset, {}).get('mask', []):
                        continue
                    pts = smp[reg]; n_ = 0
                    for co, nn in pts:
                        # อยู่ "หน้า" ผิวด้านนอกของผ้าที่ใกล้ที่สุด (ผ้าหันทางเดียวกับผิว) และยิงออกไปไม่โดนผ้า = ผิวโผล่ทะลุผ้า
                        q_, nq_, _i, _d = ib.find_nearest(co, 0.03)
                        if q_ is not None and nq_.dot(nn) > 0.3 and (co - q_).dot(nq_) > 0.001 and ib.ray_cast(co + nn * 0.0005, nn, 0.3)[0] is None:
                            ob_, oo_ = OTHER_BVH[reg]
                            hb = ob_.ray_cast(co + nn * 0.0015, nn, 0.6)
                            if hb[0] is not None:
                                if hb[3] < 0.05:
                                    continue   # มีร่างกายส่วนอื่นบังอยู่
                                hb2 = ob_.ray_cast(co - nn * 0.0015, -nn, 0.6)
                                if hb2[0] is not None and oo_[hb2[2]] is oo_[hb[2]]:
                                    continue   # จุดนี้อยู่ "ใน" ร่างกายส่วนอื่น (ยอดสะโพกในลำตัว / ปลายต้นแขนในข้อศอก) — มองไม่เห็น
                            n_ += 1
                    q = round(n_ / max(1, len(pts)), 4)
                    if q > pk:
                        pk = q; r['pokeAt'] = f'{clip}@{f}:{reg}'
                r['poke'] = pk
            if slot in ('accessory', 'back'):
                # ของติดตัว: นับ vertex ของชิ้นที่จมเข้าไปในเนื้อร่างกาย (> 4 มม.) — ลอย/ทะลุตัว
                pts_i = [p_ for p_, _n in __import__('eqlib')._eval_mesh(ob, dg)][::3]
                sink = 0
                for p_ in pts_i:
                    nb = bb.find_nearest(p_)
                    if nb[0] is not None and (p_ - nb[0]).dot(nb[1]) < -0.004:
                        sink += 1
                r['sink'] = max(r['sink'], round(sink / max(1, len(pts_i)), 4))
            ratio = round(exp / tot, 4) if tot else 0.0
            c = r['clips'].setdefault(clip, 0.0)
            r['clips'][clip] = max(c, ratio)
            if ratio > r['worst']:
                r['worst'], r['worstAt'] = ratio, f'{clip}@{f}'
    print('validated', clip)
EXPOSE_MAX = 0.02
SINK_MAX = 0.05
LIMB_MAX = 0.02   # แขน/มือจมในของบนหัว ≤ 2% ของจุดแขนทั้งหมด
POKE_MAX = 0.05   # ปรับจากภาพ QA: บั๊กไหล่ทะลุที่เห็นชัด = 9% · ยกแขนสุด (รักแร้) 3.9% มองไม่เห็น
for asset, r in validation['items'].items():
    r['pass'] = r['worst'] <= EXPOSE_MAX and r.get('sink', 0.0) <= SINK_MAX and r.get('poke', 0.0) <= POKE_MAX and r.get('limb', 0.0) <= LIMB_MAX
validation['posesPass'] = all(v['armInHead'] == 0 and v['armInTorso'] <= 5 for v in validation['poses'].values())
meta['validation'] = validation
rest_pose()
for trk in ARM.animation_data.nla_tracks:
    trk.mute = False
print('VALIDATION', json.dumps({a: (r['worst'], r['worstAt'], r['regions'], r.get('sink'), r.get('poke'), r.get('pokeAt')) for a, r in validation['items'].items()}))
print('FAILED', [a for a, r in validation['items'].items() if not r['pass']])
print('LIMB', sorted(((r.get('limb', 0), a, r.get('limbAt')) for a, r in validation['items'].items() if r.get('limb')), reverse=True)[:20])
print('POSES', json.dumps({k: v for k, v in validation['poses'].items() if v['armInHead'] or v['armInTorso']}))

# ---------- Thumbnails (Cycles CPU · 256px · โปร่งใส) ----------
attach_fabric_preview()   # ลายผ้า (normal map) เหมือน runtime — ต่อหลัง export เท่านั้น (ไม่ฝัง texture ลง GLB)
# (export เสร็จแล้ว) ต่อ vertex color 'AO' เข้า Base Color เพื่อให้ภาพย่อเหมือนตอน runtime (three.js คูณ COLOR_0 ให้เอง)
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if not bsdf or bsdf.inputs['Base Color'].is_linked:
        continue
    attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'AO'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    mix.inputs[6].default_value = bsdf.inputs['Base Color'].default_value
    nt.links.new(attr.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
s = bpy.context.scene
s.render.engine = 'CYCLES'
s.cycles.device = 'CPU'
s.cycles.samples = 48
s.cycles.use_denoising = True
s.render.film_transparent = True
s.render.resolution_x = s.render.resolution_y = 256
s.render.image_settings.file_format = 'PNG'
s.render.image_settings.color_mode = 'RGBA'
s.view_settings.view_transform = 'Standard'
FR = {'hair': (0.83, 0.56), 'hat': (0.88, 0.64), 'glasses': (0.8, 0.5), 'headphones': (0.82, 0.62), 'face': (0.8, 0.46), 'top': (0.41, 0.62),
      'outerwear': (0.38, 0.72), 'bottom': (0.19, 0.5), 'shoes': (0.08, 0.36), 'back': (0.42, 0.66), 'accessory': (0.42, 0.62), 'effect': (0.55, 1.1)}
FR_ITEM = {'HAT_HW26Witch_01': (0.98, 0.82, 22), 'BACK_HW26BatWings_01': (0.5, 1.05, 200), 'BACK_HW26PumpkinPack_01': (0.42, 0.66, 200), 'ACC_Watch_01': (0.3, 0.36, 60), 'BACK_CapeC2_01': (0.4, 0.95, 200), 'OUT_LabCoat_01': (0.33, 0.8, 22)}
HEAD_SLOTS = ('hair', 'hat', 'glasses', 'headphones', 'face')
def fr_warp(z, sc, slot):
    """กรอบภาพย่อ (เดิมตั้งในพิกัดต้นแบบ) → พิกัดจริงหลังแปลงสัดส่วน"""
    if slot in HEAD_SLOTS:
        return style_warp((0, 0, z), True).z, sc * STYLE['KH']
    return style_warp((0, 0, z)).z, sc * (0.92 if slot in ('effect',) else 0.9)
base_mat_slots = list(BASE.data.materials)
for asset, slot, ob in built:
    for a2, _, o in built:   # โชว์ใบหน้ามาตรฐานด้วย (ฐานไม่มีใบหน้าในตัว)
        o.hide_render = not (o is ob or (slot != 'face' and a2 == 'FACE_Smile_01'))
    z, sc = FR[slot]
    yaw = 200 if slot == 'back' else 22
    if asset in FR_ITEM:
        z, sc, yaw = FR_ITEM[asset]
    z, sc = fr_warp(z, sc, slot)
    frame(z, sc, yaw=yaw)
    s.render.filepath = os.path.join(OUT, 'thumbs', f'{asset}.png')
    bpy.ops.render.render(write_still=True)
# 360° Preview (QA): EQ_TURNTABLE=1 → ทุกชิ้นที่ build รอบนี้ 6 มุม (0/60/…/300°) — ใช้ตรวจทรงผม/หมวกรอบทิศ
if os.environ.get('EQ_TURNTABLE'):
    for asset, slot, ob in built:
        if slot == 'face':
            continue
        for a2, _, o in built:
            o.hide_render = not (o is ob or a2 == 'FACE_Smile_01')
        z, sc = fr_warp(*FR[slot], slot)
        for yaw in (0, 60, 120, 180, 240, 300):
            frame(z, sc * 1.05, yaw=yaw, pitch=8)
            s.render.filepath = os.path.join(OUT, 'turntable', f'{asset}_{yaw:03d}.png')
            bpy.ops.render.render(write_still=True)
        if os.environ.get('EQ_CLOSEUP'):   # "z,scale,yaw" — ภาพใกล้ 512px (ตรวจรายละเอียด เช่น เปีย/มวย)
            cz, cs, cy = (float(x) for x in os.environ['EQ_CLOSEUP'].split(','))
            s.render.resolution_x = s.render.resolution_y = 512
            frame(cz, cs, yaw=cy, pitch=8)
            s.render.filepath = os.path.join(OUT, 'turntable', f'{asset}_closeup.png')
            bpy.ops.render.render(write_still=True)
            s.render.resolution_x = s.render.resolution_y = 256
# ภาพรวม (QA)
def outfit_render(name, names, yaw=22):
    for a, _, o in built:
        o.hide_render = a not in names
    frame(0.5, 1.2, yaw=yaw)
    s.render.resolution_x, s.render.resolution_y = 360, 420
    s.render.filepath = os.path.join(OUT, 'thumbs', f'{name}.png')
    bpy.ops.render.render(write_still=True)
    s.render.resolution_x = s.render.resolution_y = 256
outfit_render('CHR_Base_01', ['FACE_Smile_01'])
if not ONLY:
    for nm, names in (('QA_Outfit_A', ['FACE_Happy_01', 'HAIR_Bob_01', 'TOP_GalaxyHoodie_01', 'BOT_Jeans_01', 'SHOE_Glow_01', 'ACC_Headphone_03', 'BACK_Jetpack_01']),
                      ('QA_Outfit_B', ['FACE_Smile_01', 'HAIR_Ponytail_01', 'TOP_SchoolShirt_01', 'BOT_SkirtPlaid_01', 'SHOE_Canvas_01', 'ACC_Glasses_05', 'HAT_GradCap_01']),
                      ('QA_Outfit_C', ['FACE_Cool_01', 'HAIR_Short_01', 'TOP_StarTee_01', 'OUT_Denim_01', 'BOT_Cargo_01', 'SHOE_HighTop_01', 'ACC_Glasses_03', 'ACC_Scarf_01']),
                      ('QA_Outfit_D', ['FACE_Focused_01', 'HAIR_Long_01', 'TOP_SweaterKnit_01', 'OUT_RankJacket_01', 'BOT_SkirtPleated_01', 'SHOE_Boots_01', 'HAT_CrownVocab_01', 'BACK_CapeC2_01', 'FX_StarOrbit_01']),
                      ('QA_Outfit_E', ['FACE_Happy_01', 'HAIR_SidePart_01', 'TOP_Polo_01', 'OUT_LabCoat_01', 'BOT_ShortsKhaki_01', 'SHOE_Sneaker_01', 'HAT_Wizard_01', 'ACC_Medal_01', 'FX_Books_01'])):
        outfit_render(nm, names)
        outfit_render(nm + '_back', names, yaw=200)

for _, _, o in built:
    o.hide_render = False
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'EQ_Avatar_Items.blend'), compress=True)
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
print('DONE', len(built), 'items')
