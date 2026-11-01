with open('frontend/src/components/customer/CheckoutStepper.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("export const CheckoutStepper = ({ currentStep = 1 }) => {", "export const CheckoutStepper = ({ currentStep, activeStep = 1 }) => {\n  const effectiveStep = currentStep || activeStep || 1;")
text = text.replace("const isDone = s.number < currentStep;", "const isDone = s.number < effectiveStep;")
text = text.replace("const isCurrent = s.number === currentStep;", "const isCurrent = s.number === effectiveStep;")
text = text.replace("Math.min(currentStep, steps.length)", "Math.min(effectiveStep, steps.length)")

with open('frontend/src/components/customer/CheckoutStepper.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("CheckoutStepper.jsx updated!")
