with open('frontend/src/components/customer/OrderTypeModal.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("import { GiDiningChair } from 'react-icons/gi';", "")
with open('frontend/src/components/customer/OrderTypeModal.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Removed GiDiningChair import!")
