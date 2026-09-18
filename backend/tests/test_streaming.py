from app.services.guacamole import build_instruction, complete_instructions_end


def test_complete_instructions_end_returns_zero_without_full_instruction():
    assert complete_instructions_end("") == 0
    assert complete_instructions_end("4.syn") == 0
    assert complete_instructions_end("4.sync,2.12") == 0


def test_complete_instructions_end_keeps_partial_tail():
    text = build_instruction("sync", "12") + build_instruction("img", "1")[:-3]
    assert complete_instructions_end(text) == len(build_instruction("sync", "12"))


def test_complete_instructions_end_ignores_semicolons_in_data():
    text = build_instruction("name", "a;b") + build_instruction("sync", "1")
    assert complete_instructions_end(text) == len(text)
    assert complete_instructions_end(text[:-1]) == len(build_instruction("name", "a;b"))


def test_complete_instructions_end_counts_characters_not_bytes():
    text = build_instruction("name", "café") + build_instruction("sync", "1")
    assert complete_instructions_end(text) == len(text)

