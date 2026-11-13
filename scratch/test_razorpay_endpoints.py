import os
import sys
import time
import django

# Set up Django environment
sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client, override_settings
from apps.payments.gateway import FakeRazorpay, use_gateway, sign_checkout

SECRET = "rzp_secret_test_key_12345"
KEY_ID = "rzp_test_foodie_key_12345"

client = Client()

print("--- 1. Testing unconfigured keys on create-order ---")
with override_settings(RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET=""):
    use_gateway(None)
    res = client.post("/api/create-order/", {"amount": 50000, "currency": "INR"}, content_type="application/json")
    print("Unconfigured create-order status:", res.status_code, res.json())
    assert res.status_code == 503, f"Expected 503, got {res.status_code}"

print("\n--- 2. Testing validation on create-order ---")
with override_settings(RAZORPAY_KEY_ID=KEY_ID, RAZORPAY_KEY_SECRET=SECRET):
    fake = FakeRazorpay()
    use_gateway(fake)

    # Missing amount
    res = client.post("/api/create-order/", {"currency": "INR"}, content_type="application/json")
    print("Missing amount status:", res.status_code, res.json())
    assert res.status_code == 400

    # Non-numeric amount
    res = client.post("/api/create-order/", {"amount": "abc", "currency": "INR"}, content_type="application/json")
    print("Non-numeric amount status:", res.status_code, res.json())
    assert res.status_code == 400

    # Amount < 100 paise
    res = client.post("/api/create-order/", {"amount": 50, "currency": "INR"}, content_type="application/json")
    # Wait, if amount is 50 paise:
    # Notice: 50 is < 100, so it must be rejected!
    print("Amount < 100 paise status:", res.status_code, res.json())
    assert res.status_code == 400

    # Invalid currency
    res = client.post("/api/create-order/", {"amount": 50000, "currency": "INVALID"}, content_type="application/json")
    print("Invalid currency status:", res.status_code, res.json())
    assert res.status_code == 400

    # Valid create-order
    res = client.post("/api/create-order/", {
        "amount": 50000,
        "currency": "INR",
        "receipt": "receipt_001"
    }, content_type="application/json")
    print("Valid create-order status:", res.status_code, res.json())
    assert res.status_code == 201
    body = res.json()
    assert "order_id" in body and body["order_id"].startswith("order_test_")
    assert body["amount"] == 50000
    assert body["currency"] == "INR"
    assert body["key_id"] == KEY_ID
    order_id = body["order_id"]

print("\n--- 3. Testing verify-payment endpoint ---")
with override_settings(RAZORPAY_KEY_ID=KEY_ID, RAZORPAY_KEY_SECRET=SECRET):
    # Missing required fields
    res = client.post("/api/verify-payment/", {
        "razorpay_order_id": order_id
    }, content_type="application/json")
    print("Missing fields verify status:", res.status_code, res.json())
    assert res.status_code == 400

    # Bad signature
    res = client.post("/api/verify-payment/", {
        "razorpay_order_id": order_id,
        "razorpay_payment_id": "pay_test_001",
        "razorpay_signature": "invalid_signature_xyz"
    }, content_type="application/json")
    print("Bad signature verify status:", res.status_code, res.json())
    assert res.status_code == 400
    assert res.json()["code"] == "invalid_signature"

    # Valid signature
    step3_payment_id = f"pay_test_{int(time.time() * 1000)}"
    valid_sig = sign_checkout(order_id, step3_payment_id, SECRET)
    res = client.post("/api/verify-payment/", {
        "razorpay_order_id": order_id,
        "razorpay_payment_id": step3_payment_id,
        "razorpay_signature": valid_sig
    }, content_type="application/json")
    print("Valid signature verify status:", res.status_code, res.json())
    assert res.status_code == 200
    assert res.json()["status"] == "SUCCESS"
    assert res.json()["success"] is True

print("\n--- 4. Testing Order Linkage & State Transition ---")
with override_settings(RAZORPAY_KEY_ID=KEY_ID, RAZORPAY_KEY_SECRET=SECRET):
    from apps.orders.models import Order
    from apps.branches.models import Branch
    from apps.payments.models import Payment
    from decimal import Decimal

    branch = Branch.objects.first()
    if not branch:
        branch = Branch.objects.create(name="Test Branch", address="123 Test St", is_active=True)

    import time
    order = Order.objects.create(
        order_number=f"TEST_ORD_{int(time.time())}",
        branch=branch,
        order_type=Order.Type.TAKEAWAY,
        status=Order.Status.PENDING,
        payment_status=Order.PaymentStatus.PENDING,
        total_amount=Decimal("250.00")
    )

    # Call create-order with order_id
    res = client.post("/api/create-order/", {
        "amount": 25000,
        "currency": "INR",
        "order_id": order.id
    }, content_type="application/json")
    assert res.status_code == 201
    created = res.json()
    rzp_order_id = created["order_id"]
    # Verify signature
    payment_id = f"pay_test_order_{int(time.time() * 1000)}"
    sig = sign_checkout(rzp_order_id, payment_id, SECRET)
    verify_res = client.post("/api/verify-payment/", {
        "razorpay_order_id": rzp_order_id,
        "razorpay_payment_id": payment_id,
        "razorpay_signature": sig
    }, content_type="application/json")
    assert verify_res.status_code == 200
    order.refresh_from_db()
    pmt_captured = Payment.objects.filter(razorpay_order_id=rzp_order_id).first()
    print("Linked order payment status after verification:", order.payment_status)
    print("Captured payment method:", pmt_captured.method, "status:", pmt_captured.status)
    assert order.payment_status == Order.PaymentStatus.PAID
    assert pmt_captured.status == Payment.Status.SUCCESS
    assert pmt_captured.method == Payment.Method.RAZORPAY

print("\n--- 5. Testing Additional Verification Validations (Order, Amount, Currency) ---")
with override_settings(RAZORPAY_KEY_ID=KEY_ID, RAZORPAY_KEY_SECRET=SECRET):
    fake = FakeRazorpay()
    use_gateway(fake)
    branch = Branch.objects.first()
    order2 = Order.objects.create(
        order_number=f"TEST_ORD_VAL_{int(time.time())}",
        branch=branch,
        order_type=Order.Type.TAKEAWAY,
        status=Order.Status.PENDING,
        payment_status=Order.PaymentStatus.PENDING,
        total_amount=Decimal("300.00")
    )
    res = client.post("/api/create-order/", {
        "amount": 30000,
        "currency": "INR",
        "order_id": order2.id
    }, content_type="application/json")
    assert res.status_code == 201
    val_rzp_order_id = res.json()["order_id"]
    val_payment_id = f"pay_val_{int(time.time() * 1000)}"
    val_sig = sign_checkout(val_rzp_order_id, val_payment_id, SECRET)

    # Test order mismatch
    bad_order_res = client.post("/api/verify-payment/", {
        "razorpay_order_id": val_rzp_order_id,
        "razorpay_payment_id": val_payment_id,
        "razorpay_signature": val_sig,
        "order_id": 999999
    }, content_type="application/json")
    assert bad_order_res.status_code == 400
    assert bad_order_res.json()["code"] == "order_mismatch"

    # Test amount mismatch
    bad_amount_res = client.post("/api/verify-payment/", {
        "razorpay_order_id": val_rzp_order_id,
        "razorpay_payment_id": val_payment_id,
        "razorpay_signature": val_sig,
        "amount": 10000
    }, content_type="application/json")
    assert bad_amount_res.status_code == 400
    assert bad_amount_res.json()["code"] == "amount_mismatch"

    # Test currency mismatch
    bad_curr_res = client.post("/api/verify-payment/", {
        "razorpay_order_id": val_rzp_order_id,
        "razorpay_payment_id": val_payment_id,
        "razorpay_signature": val_sig,
        "currency": "USD"
    }, content_type="application/json")
    assert bad_curr_res.status_code == 400
    assert bad_curr_res.json()["code"] == "currency_mismatch"

    # Successful verification with valid additional parameters
    success_val_res = client.post("/api/verify-payment/", {
        "razorpay_order_id": val_rzp_order_id,
        "razorpay_payment_id": val_payment_id,
        "razorpay_signature": val_sig,
        "order_id": order2.id,
        "amount": 30000,
        "currency": "INR"
    }, content_type="application/json")
    assert success_val_res.status_code == 200
    order2.refresh_from_db()
    assert order2.payment_status == Order.PaymentStatus.PAID
    print("Additional validations successfully passed!")

print("\n--- 6. Testing Preservation of Historical Payments ---")
with override_settings(RAZORPAY_KEY_ID=KEY_ID, RAZORPAY_KEY_SECRET=SECRET):
    historical_order = Order.objects.create(
        order_number=f"TEST_ORD_HIST_{int(time.time())}",
        branch=branch,
        order_type=Order.Type.DINE_IN,
        table_label="T-1",
        status=Order.Status.COMPLETED,
        payment_status=Order.PaymentStatus.PAID,
        total_amount=Decimal("150.00")
    )
    historical_payment = Payment.objects.create(
        order=historical_order,
        method=Payment.Method.COUNTER,
        amount=Decimal("150.00"),
        status=Payment.Status.SUCCESS
    )
    # Re-fetch to ensure historical record is untouched
    historical_payment.refresh_from_db()
    assert historical_payment.method == Payment.Method.COUNTER
    assert historical_payment.status == Payment.Status.SUCCESS
    print("Historical payment preserved:", historical_payment.method, historical_payment.status)

print("\n--- 7. Testing Regression on Legacy Endpoint /api/payments/verify/ ---")
with override_settings(RAZORPAY_KEY_ID=KEY_ID, RAZORPAY_KEY_SECRET=SECRET):
    fake = FakeRazorpay()
    use_gateway(fake)
    legacy_rzp_id = fake.create_order(amount=10000)
    legacy_payment_id = f"pay_legacy_{int(time.time() * 1000)}"
    legacy_sig = sign_checkout(legacy_rzp_id, legacy_payment_id, SECRET)
    res = client.post("/api/payments/verify/", {
        "razorpay_order_id": legacy_rzp_id,
        "razorpay_payment_id": legacy_payment_id,
        "razorpay_signature": legacy_sig
    }, content_type="application/json")
    assert res.status_code == 200
    assert res.json()["status"] == "SUCCESS"
    print("Legacy /api/payments/verify/ status:", res.status_code, res.json())

print("\n--- 8. Testing Serializer Validation for RAZORPAY Choice ---")
from apps.orders.api import PlaceOrderSerializer
from apps.payments.views import StartPaymentSerializer

ser_order = PlaceOrderSerializer(data={
    "branch": branch.id,
    "idempotency_key": f"test-key-{int(time.time())}",
    "payment_method": "RAZORPAY"
})
assert ser_order.is_valid(), f"PlaceOrderSerializer failed: {ser_order.errors}"
print("PlaceOrderSerializer with RAZORPAY is valid:", ser_order.is_valid())

ser_pay = StartPaymentSerializer(data={"method": "RAZORPAY"})
assert ser_pay.is_valid(), f"StartPaymentSerializer failed: {ser_pay.errors}"
print("StartPaymentSerializer with RAZORPAY is valid:", ser_pay.is_valid())

print("\n>>> ALL BACKEND ENDPOINT & REGRESSION TESTS PASSED SUCCESSFULLY! <<<")
use_gateway(None)
