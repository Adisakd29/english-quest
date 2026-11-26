DROP TABLE IF EXISTS draw_game_players;
DROP TABLE IF EXISTS draw_games;
DROP TABLE IF EXISTS draw_report_evidence;
ALTER TABLE world_chat_messages DROP COLUMN IF EXISTS invite_ref;
ALTER TABLE world_chat_messages DROP COLUMN IF EXISTS invite_kind;
