/*
  Avatar Pilot Catalog — ของทุกชิ้นเห็นชื่อ หน้าตา และราคาก่อนซื้อเสมอ (ไม่มีกล่องสุ่ม / gacha / เงินจริง)
  rarity มีผลแค่ความหายาก/หน้าตา — ไม่มีผลต่อความสามารถใด ๆ (ไม่มี EXP / Rank / คะแนน / พลังใน Ranked)

  ราคา (ตรวจกับอัตราได้ Coin จริงใน config/coinRewards.js · ผู้เรียนสม่ำเสมอได้ราว 300–450 Coins/สัปดาห์):
    Common 60–120 (1–2 วัน) · Uncommon 150–280 (~ครึ่งสัปดาห์) · Rare 320–550 (~1 สัปดาห์) · Epic 700–1000 (~2 สัปดาห์) · Legendary 1400–1800 (~1 เดือน)
  starter = ทุกคนได้ฟรีตั้งแต่วันแรก · achievementId = ได้จาก Achievement เท่านั้น (ซื้อไม่ได้) · eventId = ของธีมกิจกรรม (ซื้อด้วย Coin ปกติ ไม่มีวันหมดเขต)
*/
const I = (id, slot, name, nameTh, rarity, price, extra = {}) => ({ id, slot, name, nameTh, rarity, price, ...extra });

module.exports = [
  // ---- Body (สีผิว · ฟรีทั้งหมด) ----
  I('body_light', 'body', 'Skin Tone 1', 'สีผิว 1', 'common', 0, { starter: true }),
  I('body_warm', 'body', 'Skin Tone 2', 'สีผิว 2', 'common', 0, { starter: true }),
  I('body_tan', 'body', 'Skin Tone 3', 'สีผิว 3', 'common', 0, { starter: true }),
  I('body_deep', 'body', 'Skin Tone 4', 'สีผิว 4', 'common', 0, { starter: true }),
  // ---- Face (ฟรีทั้งหมด) ----
  I('face_smile', 'face', 'Smile', 'ยิ้ม', 'common', 0, { starter: true }),
  I('face_happy', 'face', 'Happy', 'ดีใจ', 'common', 0, { starter: true }),
  I('face_cool', 'face', 'Cool', 'ชิล', 'common', 0, { starter: true }),
  I('face_focused', 'face', 'Focused', 'ตั้งใจ', 'common', 0, { starter: true }),
  // ---- Hair (5) ----
  I('hair_crop', 'hair', 'Short Crop', 'ผมสั้นเรียบ', 'common', 0, { starter: true }),
  I('hair_sidepart', 'hair', 'Side Swept', 'ผมปัดข้าง', 'common', 0, { starter: true }),
  I('hair_bob', 'hair', 'Bob Cut', 'ผมบ็อบ', 'common', 0, { starter: true }),
  I('hair_ponytail', 'hair', 'Ponytail', 'ผมหางม้า', 'common', 110),
  I('hair_long', 'hair', 'Long Hair', 'ผมยาว', 'uncommon', 220),
  // ---- Tops (8) ----
  I('top_tee_blue', 'top', 'Blue Tee', 'เสื้อยืดสีฟ้า', 'common', 0, { starter: true , collection: 'everyday' }),
  I('top_polo_green', 'top', 'Green Polo', 'เสื้อโปโลสีเขียว', 'common', 0, { starter: true , collection: 'everyday' }),
  I('top_hoodie_gray', 'top', 'Gray Hoodie', 'ฮู้ดดี้สีเทา', 'common', 0, { starter: true , collection: 'everyday' }),
  I('top_tee_stripe', 'top', 'Striped Tee', 'เสื้อลายทาง', 'common', 90, { collection: 'everyday' }),
  I('top_sweater_knit', 'top', 'Knit Sweater', 'สเวตเตอร์ไหมพรม', 'uncommon', 180, { collection: 'winter' }),
  I('top_school_shirt', 'top', 'School Shirt', 'เสื้อนักเรียนผูกไท', 'uncommon', 200, { collection: 'school' }),
  I('top_tee_star', 'top', 'Star Tee', 'เสื้อยืดลายดาว', 'rare', 380, { featured: true , collection: 'street' }),
  I('top_hoodie_galaxy', 'top', 'Galaxy Hoodie', 'ฮู้ดดี้กาแล็กซี', 'epic', 850, { featured: true , collection: 'fantasy' }),
  // ---- Bottoms (5) ----
  I('bottom_jeans', 'bottom', 'Blue Jeans', 'กางเกงยีนส์', 'common', 0, { starter: true , collection: 'everyday' }),
  I('bottom_skirt_pleated', 'bottom', 'Pleated Skirt', 'กระโปรงจีบ', 'common', 0, { starter: true , collection: 'school' }),
  I('bottom_shorts_khaki', 'bottom', 'Khaki Shorts', 'กางเกงขาสั้นสีกากี', 'common', 80, { collection: 'summer' }),
  I('bottom_cargo', 'bottom', 'Cargo Pants', 'กางเกงคาร์โก', 'uncommon', 170, { collection: 'street' }),
  I('bottom_skirt_plaid', 'bottom', 'Plaid Skirt', 'กระโปรงลายสก็อต', 'rare', 340, { collection: 'school' }),
  // ---- Shoes (5) ----
  I('shoes_sneaker_white', 'shoes', 'White Sneakers', 'รองเท้าผ้าใบขาว', 'common', 0, { starter: true , collection: 'everyday' }),
  I('shoes_canvas_black', 'shoes', 'Black Canvas', 'รองเท้าผ้าใบดำ', 'common', 0, { starter: true , collection: 'school' }),
  I('shoes_boots_brown', 'shoes', 'Brown Boots', 'บูทสีน้ำตาล', 'uncommon', 160, { collection: 'winter' }),
  I('shoes_hightop_red', 'shoes', 'Red High-tops', 'รองเท้าหุ้มข้อแดง', 'rare', 360, { collection: 'street' }),
  I('shoes_glow_sneaker', 'shoes', 'Glow Sneakers', 'รองเท้าเรืองแสง', 'epic', 760, { collection: 'cyber' }),
  // ---- Hats (5 ร้าน + 1 ธีมกิจกรรม + 1 Achievement) ----
  I('hat_cap_red', 'hat', 'Red Cap', 'หมวกแก๊ปแดง', 'common', 90, { collection: 'everyday' }),
  I('hat_beanie_teal', 'hat', 'Teal Beanie', 'หมวกไหมพรม', 'common', 110, { collection: 'winter' }),
  I('hat_bucket_tan', 'hat', 'Bucket Hat', 'หมวกบักเก็ต', 'uncommon', 200, { collection: 'street' }),
  I('hat_grad_cap', 'hat', 'Graduation Cap', 'หมวกรับปริญญา', 'rare', 480, { featured: true , collection: 'school' }),
  I('hat_wizard', 'hat', 'Wizard Hat', 'หมวกพ่อมด', 'epic', 920, { collection: 'fantasy' }),
  I('hat_pumpkin', 'hat', 'Pumpkin Hat', 'หมวกฟักทอง', 'uncommon', 260, { eventId: 'halloween' , collection: 'seasonal' }),
  I('hat_crown_vocab', 'hat', 'Vocabulary Crown', 'มงกุฎคำศัพท์', 'legendary', 0, { purchasable: false, achievementId: 'vocab_300' , collection: 'fantasy' }),
  // ---- Glasses (4 ร้าน + 1 Achievement) ----
  I('glasses_round', 'glasses', 'Round Glasses', 'แว่นกลม', 'common', 80, { collection: 'minimal' }),
  I('glasses_sunglasses', 'glasses', 'Sunglasses', 'แว่นกันแดด', 'uncommon', 220, { collection: 'summer' }),
  I('glasses_heart_shades', 'glasses', 'Heart Shades', 'แว่นหัวใจ', 'rare', 400, { collection: 'street' }),
  I('glasses_visor', 'glasses', 'Future Visor', 'ไวเซอร์อนาคต', 'epic', 880, { collection: 'cyber' }),
  I('glasses_grammar', 'glasses', 'Grammar Glasses', 'แว่นแกรมม่า', 'epic', 0, { purchasable: false, achievementId: 'grammar_master' , collection: 'school' }),
  // ---- Headphones (3 ร้าน + 1 Achievement) ----
  I('phones_basic', 'headphones', 'Basic Headphones', 'หูฟังพื้นฐาน', 'common', 120, { collection: 'everyday' }),
  I('phones_neon', 'headphones', 'Neon Headphones', 'หูฟังนีออน', 'rare', 420, { collection: 'cyber' }),
  I('phones_cat', 'headphones', 'Cat-ear Headphones', 'หูฟังหูแมว', 'epic', 780, { collection: 'street' }),
  I('phones_toeic', 'headphones', 'TOEIC Headphones', 'หูฟัง TOEIC', 'epic', 0, { purchasable: false, achievementId: 'toeic_listener' , collection: 'school' }),
  // ---- Back items (3 ร้าน + 1 Achievement) ----
  I('back_backpack_school', 'back', 'School Backpack', 'กระเป๋าเป้นักเรียน', 'common', 100, { collection: 'school' }),
  I('back_backpack_explorer', 'back', 'Explorer Pack', 'เป้นักสำรวจ', 'uncommon', 240, { collection: 'fantasy' }),
  I('back_jetpack', 'back', 'Jetpack', 'เจ็ตแพ็ก', 'legendary', 1500, { featured: true , collection: 'cyber' }),
  I('back_cape_c2', 'back', 'C2 Cape', 'ผ้าคลุม C2', 'legendary', 0, { purchasable: false, achievementId: 'c2_scholar' , collection: 'fantasy' }),
  // ---- Outerwear (2 ร้าน + 1 Achievement) ----
  I('outer_denim_jacket', 'outerwear', 'Denim Jacket', 'แจ็กเก็ตยีนส์', 'rare', 420, { collection: 'everyday' }),
  I('outer_lab_coat', 'outerwear', 'Lab Coat', 'เสื้อกาวน์', 'uncommon', 280, { collection: 'school' }),
  I('outer_rank_jacket', 'outerwear', 'Rank Jacket', 'แจ็กเก็ตแรงค์', 'epic', 0, { purchasable: false, achievementId: 'rank_climber' , collection: 'sport' }),
  // ---- Accessories (3) ----
  I('acc_watch', 'accessory', 'Wristwatch', 'นาฬิกาข้อมือ', 'common', 0, { starter: true , collection: 'everyday' }),
  I('acc_scarf_red', 'accessory', 'Red Scarf', 'ผ้าพันคอแดง', 'uncommon', 170, { collection: 'winter' }),
  I('acc_medal', 'accessory', 'Gold Medal', 'เหรียญทอง', 'rare', 360, { collection: 'sport' }),
  // ---- Effects (4) ----
  I('fx_sparkles', 'effect', 'Sparkles', 'ประกายดาว', 'uncommon', 260, { collection: 'everyday' }),
  I('fx_books_float', 'effect', 'Floating Books', 'หนังสือลอย', 'rare', 520, { collection: 'school' }),
  I('fx_aurora', 'effect', 'Aurora Glow', 'แสงออโรรา', 'epic', 980, { collection: 'winter' }),
  I('fx_star_orbit', 'effect', 'Star Orbit', 'วงโคจรดาว', 'legendary', 1600, { collection: 'fantasy' }),
  // ---- Backgrounds (4) ----
  I('bg_sky', 'background', 'Blue Sky', 'ท้องฟ้า', 'common', 0, { starter: true }),
  I('bg_library', 'background', 'Library', 'ห้องสมุด', 'common', 120),
  I('bg_sunset', 'background', 'Sunset', 'พระอาทิตย์ตก', 'uncommon', 220),
  I('bg_space', 'background', 'Outer Space', 'อวกาศ', 'rare', 500),

  // =====================================================================
  // คอลเลกชันใหม่ v1.8.0 (12 ธีม · โมเดล 3D จริงทุกชิ้น · ไม่จำกัดตามเพศ)
  // =====================================================================
  // ---- ทรงผมใหม่ ----
  I('hair_curly', 'hair', 'Curly Crop', 'ผมหยิกสั้น', 'common', 120),
  I('hair_wavy_long', 'hair', 'Long Waves', 'ผมยาวลอนคลื่น', 'uncommon', 240),
  I('hair_twin_buns', 'hair', 'Twin Buns', 'ผมมวยคู่', 'uncommon', 260),
  I('hair_side_braid', 'hair', 'Side Braid', 'ผมเปียข้าง', 'rare', 360),
  I('hair_spiky', 'hair', 'Spiky Blue', 'ผมตั้งชี้สีฟ้า', 'rare', 420),
  // ---- Streetwear ----
  I('top_oversize_graphic', 'top', 'Oversized Graphic Tee', 'เสื้อโอเวอร์ไซซ์ลายกราฟิก', 'uncommon', 220, { collection: 'street' }),
  I('outer_bomber', 'outerwear', 'Bomber Jacket', 'แจ็กเก็ตบอมเบอร์', 'rare', 480, { collection: 'street' }),
  I('shoes_chunky_street', 'shoes', 'Chunky Sneakers', 'สนีกเกอร์พื้นหนา', 'rare', 440, { collection: 'street' }),
  I('hat_snapback', 'hat', 'Snapback', 'หมวกสแนปแบ็ก', 'uncommon', 180, { collection: 'street' }),
  I('acc_chain_necklace', 'accessory', 'Chain Necklace', 'สร้อยโซ่', 'uncommon', 200, { collection: 'street' }),
  I('back_skateboard', 'back', 'Skateboard', 'สเก็ตบอร์ด', 'epic', 760, { collection: 'street' }),
  // ---- Smart Casual ----
  I('top_oxford_shirt', 'top', 'Oxford Shirt', 'เชิ้ตอ็อกซ์ฟอร์ด', 'uncommon', 200, { collection: 'smart' }),
  I('outer_blazer', 'outerwear', 'Navy Blazer', 'เบลเซอร์กรมท่า', 'rare', 520, { collection: 'smart' }),
  I('bottom_chinos', 'bottom', 'Chinos', 'กางเกงชิโน่', 'uncommon', 180, { collection: 'smart' }),
  I('shoes_loafers', 'shoes', 'Leather Loafers', 'โลฟเฟอร์หนัง', 'rare', 380, { collection: 'smart' }),
  I('acc_bowtie', 'accessory', 'Bow Tie', 'โบว์ไท', 'common', 90, { collection: 'smart' }),
  // ---- Sportwear ----
  I('top_sport_jersey', 'top', 'Team Jersey', 'เสื้อกีฬาทีม', 'common', 110, { collection: 'sport' }),
  I('bottom_track_pants', 'bottom', 'Track Pants', 'กางเกงวอร์ม', 'common', 100, { collection: 'sport' }),
  I('shoes_runners', 'shoes', 'Running Shoes', 'รองเท้าวิ่ง', 'uncommon', 230, { collection: 'sport' }),
  I('acc_sweatband', 'accessory', 'Wristband', 'สายรัดข้อมือกีฬา', 'common', 60, { collection: 'sport' }),
  I('hat_sport_headband', 'hat', 'Sport Headband', 'ผ้าคาดหัวกีฬา', 'common', 70, { collection: 'sport' }),
  // ---- School & Campus ----
  I('outer_varsity', 'outerwear', 'Varsity Jacket', 'แจ็กเก็ตวาร์ซิตี้', 'rare', 500, { collection: 'school' }),
  I('acc_id_lanyard', 'accessory', 'Student ID', 'บัตรนักเรียนคล้องคอ', 'common', 60, { collection: 'school' }),
  // ---- Minimal Fashion ----
  I('top_turtleneck', 'top', 'Turtleneck', 'เสื้อคอเต่า', 'uncommon', 190, { collection: 'minimal' }),
  I('bottom_wide_trousers', 'bottom', 'Wide Trousers', 'กางเกงขากว้าง', 'uncommon', 210, { collection: 'minimal' }),
  I('shoes_slipon_white', 'shoes', 'White Slip-ons', 'สลิปออนสีขาว', 'common', 120, { collection: 'minimal' }),
  I('back_tote_canvas', 'back', 'Canvas Tote', 'กระเป๋าผ้าแคนวาส', 'common', 110, { collection: 'minimal' }),
  I('acc_minimal_pendant', 'accessory', 'Bar Pendant', 'สร้อยจี้มินิมอล', 'uncommon', 160, { collection: 'minimal' }),
  // ---- Vintage ----
  I('top_ringer_tee', 'top', 'Ringer Tee', 'เสื้อยืดริงเกอร์', 'common', 100, { collection: 'vintage' }),
  I('outer_cardigan', 'outerwear', 'Knit Cardigan', 'คาร์ดิแกนไหมพรม', 'uncommon', 260, { collection: 'vintage' }),
  I('bottom_corduroy', 'bottom', 'Corduroy Pants', 'กางเกงลูกฟูก', 'uncommon', 200, { collection: 'vintage' }),
  I('shoes_retro_court', 'shoes', 'Retro Court Shoes', 'รองเท้าคอร์ทเรโทร', 'uncommon', 240, { collection: 'vintage' }),
  I('hat_beret', 'hat', 'Beret', 'หมวกเบเรต์', 'uncommon', 170, { collection: 'vintage' }),
  I('glasses_aviator', 'glasses', 'Aviators', 'แว่นนักบิน', 'rare', 360, { collection: 'vintage' }),
  I('acc_neckerchief', 'accessory', 'Neckerchief', 'ผ้าผูกคอวินเทจ', 'common', 90, { collection: 'vintage' }),
  // ---- Fantasy Adventure ----
  I('top_adventurer_tunic', 'top', 'Adventurer Tunic', 'ทูนิกนักผจญภัย', 'rare', 420, { collection: 'fantasy' }),
  I('bottom_ranger_pants', 'bottom', 'Ranger Pants', 'กางเกงเรนเจอร์', 'uncommon', 260, { collection: 'fantasy' }),
  I('shoes_adventure_boots', 'shoes', 'Adventure Boots', 'บูทนักผจญภัย', 'rare', 400, { collection: 'fantasy' }),
  I('acc_amulet', 'accessory', 'Glow Amulet', 'เครื่องรางเรืองแสง', 'epic', 720, { collection: 'fantasy' }),
  I('back_quiver', 'back', 'Arrow Quiver', 'กระบอกลูกธนู', 'rare', 460, { collection: 'fantasy' }),
  // ---- Cyber / Techwear ----
  I('top_tech_zip', 'top', 'Tech Zip Top', 'เสื้อเทคซิปกลาง', 'rare', 380, { collection: 'cyber' }),
  I('outer_tech_shell', 'outerwear', 'Tech Shell', 'เสื้อกันลมเทคแวร์', 'epic', 860, { collection: 'cyber' }),
  I('bottom_tech_joggers', 'bottom', 'Tech Joggers', 'จ็อกเกอร์เทค', 'rare', 360, { collection: 'cyber' }),
  I('shoes_tech_boots', 'shoes', 'Tech Boots', 'บูทเทค', 'epic', 740, { collection: 'cyber' }),
  I('acc_smartband', 'accessory', 'Smart Band', 'สมาร์ตแบนด์', 'uncommon', 210, { collection: 'cyber' }),
  I('back_sling_tech', 'back', 'Tech Sling', 'กระเป๋าสลิงเทค', 'uncommon', 240, { collection: 'cyber' }),
  // ---- Winter Fashion ----
  I('outer_puffer', 'outerwear', 'Puffer Jacket', 'เสื้อบุนวม', 'rare', 540, { collection: 'winter' }),
  I('bottom_snow_pants', 'bottom', 'Snow Pants', 'กางเกงกันหิมะ', 'uncommon', 240, { collection: 'winter' }),
  I('shoes_snow_boots', 'shoes', 'Snow Boots', 'บูทกันหิมะ', 'uncommon', 260, { collection: 'winter' }),
  I('acc_mittens', 'accessory', 'Knit Mittens', 'ถุงมือไหมพรม', 'common', 110, { collection: 'winter' }),
  I('phones_earmuffs', 'headphones', 'Fluffy Earmuffs', 'ที่ปิดหูขนนุ่ม', 'uncommon', 190, { collection: 'winter' }),
  // ---- Summer Fashion ----
  I('top_tank_summer', 'top', 'Sunny Tank', 'เสื้อกล้ามซัมเมอร์', 'common', 80, { collection: 'summer' }),
  I('top_hawaiian_shirt', 'top', 'Tropical Shirt', 'เชิ้ตลายทรอปิคอล', 'uncommon', 220, { collection: 'summer' }),
  I('bottom_board_shorts', 'bottom', 'Board Shorts', 'กางเกงชายหาด', 'common', 100, { collection: 'summer' }),
  I('shoes_sandals', 'shoes', 'Strap Sandals', 'รองเท้าแตะรัดส้น', 'common', 90, { collection: 'summer' }),
  I('hat_sun_hat', 'hat', 'Straw Sun Hat', 'หมวกสานปีกกว้าง', 'uncommon', 210, { collection: 'summer' }),
  I('acc_bead_bracelet', 'accessory', 'Bead Bracelet', 'กำไลลูกปัด', 'common', 70, { collection: 'summer' }),
  // ---- Seasonal Events ----
  I('top_holiday_sweater', 'top', 'Holiday Sweater', 'สเวตเตอร์เทศกาล', 'rare', 400, { collection: 'seasonal', eventId: 'winter_festival' }),
  I('top_songkran_shirt', 'top', 'Songkran Shirt', 'เสื้อลายดอกสงกรานต์', 'uncommon', 230, { collection: 'seasonal', eventId: 'songkran' }),
  I('bottom_thai_fisherman', 'bottom', 'Thai Fisherman Pants', 'กางเกงเลไทย', 'uncommon', 180, { collection: 'seasonal', eventId: 'songkran' }),
  I('shoes_holiday_booties', 'shoes', 'Holiday Booties', 'บูทเทศกาลขอบขน', 'rare', 380, { collection: 'seasonal', eventId: 'winter_festival' }),
  I('acc_flower_garland', 'accessory', 'Jasmine Garland', 'พวงมาลัยมะลิ', 'uncommon', 200, { collection: 'seasonal', eventId: 'songkran' }),
  I('fx_snowfall', 'effect', 'Snowfall', 'หิมะโปรย', 'rare', 520, { collection: 'seasonal', eventId: 'winter_festival' }),
  I('fx_lanterns', 'effect', 'Floating Lanterns', 'โคมลอยยี่เป็ง', 'epic', 900, { collection: 'seasonal', eventId: 'loy_krathong' }),
  // ---- Halloween Costume Festival 2026 (24–31 ต.ค. 2569) — ได้จากกิจกรรมเท่านั้น (ซื้อไม่ได้) · ได้แล้วเป็นของถาวร ----
  //      config/events.js → halloween-costume-2026 (login = รางวัลรายวัน · quests = เควสต์การเรียน)
  ...[
    ['hat_hw26_pumpkin', 'hat', 'Pumpkin Hat', 'หมวกฟักทองฮาโลวีน', 'rare'],
    ['back_hw26_batwings', 'back', 'Bat Wings', 'ปีกค้างคาว', 'epic'],
    ['top_hw26_ghost_hoodie', 'top', 'Ghost Hoodie', 'ฮู้ดดี้ผีน้อย', 'rare'],
    ['hat_hw26_witch', 'hat', 'Witch Hat', 'หมวกแม่มด', 'epic'],
    ['shoes_hw26_boots', 'shoes', 'Halloween Boots', 'บูทฮาโลวีน', 'rare'],
    ['back_hw26_pumpkin_pack', 'back', 'Pumpkin Backpack', 'เป้ฟักทอง', 'rare'],
    ['outer_hw26_midnight', 'outerwear', 'Midnight Cloak Coat', 'เสื้อคลุมรัตติกาล', 'legendary'],
    ['bottom_hw26_midnight', 'bottom', 'Midnight Star Pants', 'กางเกงดาวรัตติกาล', 'legendary'],
    ['acc_hw26_moon', 'accessory', 'Crescent Moon Pendant', 'จี้พระจันทร์เสี้ยว', 'legendary'],
    ['acc_hw26_candy', 'accessory', 'Candy Corn Necklace', 'สร้อยลูกอมแคนดี้คอร์น', 'uncommon'],
    ['glasses_hw26_bat', 'glasses', 'Bat Glasses', 'แว่นค้างคาว', 'uncommon'],
    ['bg_hw26_moonlit', 'background', 'Moonlit Pumpkin Patch', 'ทุ่งฟักทองใต้แสงจันทร์', 'rare'],
  ].map(([id, slot, name, nameTh, rarity]) => I(id, slot, name, nameTh, rarity, 0,
    { purchasable: false, eventId: 'halloween-costume-2026', collection: 'halloween26' })),
  // ---- Loy Krathong Festival 2026 (18–25 พ.ย. 2569) — ได้จากกิจกรรมเท่านั้น (ซื้อไม่ได้) · ได้แล้วเป็นของถาวร ----
  //      config/events.js → loykrathong-2026 (login = รางวัลรายวัน · quests = เควสต์การเรียน) · docs/LOY_KRATHONG_2026.md
  ...[
    ['hat_lk26_frangipani', 'hat', 'Frangipani Hair Flower', 'ดอกลีลาวดีทัดหู', 'rare'],
    ['shoes_lk26_sandals', 'shoes', 'Woven Sandals', 'รองเท้าแตะสาน', 'uncommon'],
    ['top_lk26_indigo', 'top', 'Indigo Cotton Shirt', 'เสื้อคอจีนผ้าฝ้ายย้อมคราม', 'rare'],
    ['back_lk26_umbrella', 'back', 'Bo Sang Paper Umbrella', 'ร่มบ่อสร้าง', 'epic'],
    ['outer_lk26_pakama', 'outerwear', 'Pakama Shoulder Cloth', 'ผ้าขาวม้าพาดบ่า', 'rare'],
    ['acc_lk26_jasmine', 'accessory', 'Jasmine Wrist Garland', 'พวงมาลัยข้อมือดอกมะลิ', 'rare'],
    ['top_lk26_silk', 'top', 'Full-Moon Silk Shirt', 'เสื้อผ้าไหมแขนกระบอก', 'legendary'],
    ['bottom_lk26_chongkraben', 'bottom', 'Chong Kraben', 'โจงกระเบน', 'legendary'],
    ['fx_lk26_krathong', 'effect', 'Floating Krathong', 'กระทงลอยรอบตัว', 'legendary'],
    ['acc_lk26_lotus', 'accessory', 'Lotus Brooch', 'เข็มกลัดดอกบัว', 'uncommon'],
    ['bg_lk26_river', 'background', 'Full-Moon River', 'สายน้ำคืนเพ็ญ', 'rare'],
  ].map(([id, slot, name, nameTh, rarity]) => I(id, slot, name, nameTh, rarity, 0,
    { purchasable: false, eventId: 'loykrathong-2026', collection: 'loykrathong26' })),
];

// ธีมคอลเลกชัน (ลำดับที่แสดงในร้าน)
module.exports.COLLECTIONS = [
  ['everyday', 'Everyday Casual', 'ชุดลำลองทุกวัน'], ['street', 'Streetwear', 'สตรีทแวร์'], ['smart', 'Smart Casual', 'สมาร์ตแคชชวล'],
  ['sport', 'Sportwear', 'ชุดกีฬา'], ['school', 'School & Campus', 'โรงเรียนและมหาวิทยาลัย'], ['minimal', 'Minimal Fashion', 'มินิมอล'],
  ['vintage', 'Vintage', 'วินเทจ'], ['fantasy', 'Fantasy Adventure', 'แฟนตาซีผจญภัย'], ['cyber', 'Cyber / Techwear', 'ไซเบอร์ / เทคแวร์'],
  ['winter', 'Winter Fashion', 'แฟชั่นฤดูหนาว'], ['summer', 'Summer Fashion', 'แฟชั่นฤดูร้อน'], ['seasonal', 'Seasonal Events', 'เทศกาล'],
  ['halloween26', 'Halloween Costume Festival 2026', 'เทศกาลชุดฮาโลวีน 2026'],
  ['loykrathong26', 'Loy Krathong Festival 2026', 'เทศกาลลอยกระทง 2569'],
].map(([id, name, nameTh]) => ({ id, name, nameTh }));
