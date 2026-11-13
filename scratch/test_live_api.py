import sys; sys.path.insert(0, r'D:\curser\foodie-push\backend')
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

import json, urllib.request
from rest_framework_simplejwt.tokens import RefreshToken
from apps.accounts.models import Employee, User
from apps.orders.models import Order
from apps.branches.models import DiningTable
from apps.coupons.models import Coupon

# 1. Generate JWT token for admin REDDY
emp = Employee.objects.get(employee_code='REDDY')
token = str(RefreshToken.for_user(emp.user).access_token)

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# 2. Test GET /api/tables/
req = urllib.request.Request('http://127.0.0.1:8000/api/tables/', headers=headers)
with urllib.request.urlopen(req) as res:
    tables = json.loads(res.read().decode())
    print('Fetched tables count:', len(tables))
    for t in tables:
        t_num = t.get('table_number')
        st = t.get('status')
        has_act = t.get('has_active_order')
        act_id = t.get('active_order_id')
        print(f"Table {t_num}: status={st} has_active_order={has_act} active_order_id={act_id}")

branch_id = 9
# 3. Test PATCH /api/orders/<pk>/ with coupon
test_order = Order.objects.filter(branch_id=branch_id, status__in=['PENDING', 'PREPARING', 'READY', 'SERVED'], payment_status='PENDING').first()
if not test_order:
    table = DiningTable.objects.filter(branch_id=branch_id).first()
    test_order = Order.objects.create(
        order_number='ORD-LIVE-TEST-1',
        branch_id=branch_id,
        table=table,
        table_label=table.table_number,
        order_type='DINE_IN',
        status='PREPARING',
        payment_status='PENDING',
        items_subtotal=500,
        taxable_amount=500,
        total_amount=525,
    )

print(f'Testing PATCH on Order #{test_order.id}')
# Test applying invalid coupon
data = json.dumps({'coupon_code': 'INVALID_CODE'}).encode()
patch_req = urllib.request.Request(f'http://127.0.0.1:8000/api/orders/{test_order.id}/', data=data, headers=headers, method='PATCH')
try:
    with urllib.request.urlopen(patch_req) as res:
        print('Apply invalid unexpected success:', res.status)
except urllib.error.HTTPError as e:
    err_body = json.loads(e.read().decode())
    print('Apply invalid correctly returned 400:', err_body)

# Test applying valid coupon
cpn = Coupon.objects.filter(branch_id=branch_id, is_active=True).first()
if cpn:
    data = json.dumps({'coupon_code': cpn.code}).encode()
    patch_req = urllib.request.Request(f'http://127.0.0.1:8000/api/orders/{test_order.id}/', data=data, headers=headers, method='PATCH')
    try:
        with urllib.request.urlopen(patch_req) as res:
            res_data = json.loads(res.read().decode())
            print(f'Apply coupon {cpn.code} SUCCESS! Status: {res.status}')
            print('Coupon discount total:', res_data.get('coupon_discount_total'))
            print('Total amount:', res_data.get('total_amount'))
    except urllib.error.HTTPError as e:
        print('Apply coupon failed:', e.code, e.read().decode())

    # Test removing coupon
    remove_data = json.dumps({'remove_coupon': True}).encode()
    patch_req = urllib.request.Request(f'http://127.0.0.1:8000/api/orders/{test_order.id}/', data=remove_data, headers=headers, method='PATCH')
    with urllib.request.urlopen(patch_req) as res:
        res_data = json.loads(res.read().decode())
        print('Remove coupon SUCCESS! Status:', res.status)
        print('Coupon discount after removal:', res_data.get('coupon_discount_total'))
