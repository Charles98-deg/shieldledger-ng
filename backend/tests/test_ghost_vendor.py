"""T12 ghost vendor."""
from app.engine.ghost_vendor import detect
from app.models.domain import Employee, VendorRecord
from app.normalize import nuban_norm, phone_norm

EMP = [Employee(emp_id="EMP-0042", name="Edet Effiong", nuban="0987 654 321", phone="0805 222 0042"),
       Employee(emp_id="EMP-0013", name="Bassey Okon", nuban="3011223355", phone="+234 805 222 0013")]


def test_t12_g1_flagged_g0_clean():
    vendors = [VendorRecord(id="V-ANWANA", name="Anwana Support Services", nuban="0987654321", phone="08030000001"),
               VendorRecord(id="V-AKPABUYO", name="Akpabuyo Cleaning Co.", nuban="0123456780", phone="08030000002")]
    hits = detect(vendors, EMP)
    assert [(h.vendor_id, h.emp_id, h.matched_on) for h in hits] == [("V-ANWANA", "EMP-0042", ["NUBAN"])]
    assert "EMP-0042" in hits[0].steps[0].inputs["payroll_record"]


def test_t12_phone_match_needs_different_name():
    v = [VendorRecord(id="V1", name="Okon Supplies", nuban="1111111111", phone="08052220013")]
    assert detect(v, EMP)[0].matched_on == ["PHONE"]
    same = [VendorRecord(id="V2", name="Bassey Okon", nuban="1111111111", phone="08052220013")]
    assert detect(same, EMP) == []


def test_t12_normalization():
    assert nuban_norm("0987 654 321") == "0987654321"
    assert nuban_norm("0987-654-321") == "0987654321"
    assert nuban_norm("12345") is None
    assert phone_norm("+234 803 000 0001") == phone_norm("08030000001") == "8030000001"
