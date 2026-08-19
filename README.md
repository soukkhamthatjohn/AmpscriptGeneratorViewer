# SFMC AMPscript Subject Line Generator

A lightweight, local-first Single Page Application (SPA) designed to help email marketing teams generate robust AMPscript for dynamic subject lines and their corresponding fallbacks.

## Key Features

1. **Intelligent Diff Alignment**: Automatically aligns your dynamic subject line with the fallback subject line, identifying variable boundaries and mismatch regions.
2. **Flexible Formats**:
   - **Inline AMPscript**: For copying directly into the Marketing Cloud Subject Line input box.
   - **Block AMPscript**: For creating a clean, structured block at the top of your email body using `AttributeValue()` and `Concat()` - the best practice for robust email rendering.
3. **Interactive Simulator**: Put in custom values for your variables or leave them empty to preview exactly how the subject line will render in a simulated inbox notification in real-time.
4. **Onboarding Presets**: Load pre-built templates to instantly see the tool in action.

## Getting Started

1. Navigate to the project directory:
   `C:\Users\jsoukkh\.gemini\antigravity\scratch\ampscript-subject-line-generator\`
2. Double-click **`index.html`** to open the application directly in any modern web browser (Chrome, Safari, Edge, Firefox).
3. Alternatively, if you want to host it or run it via a local server:
   - Python: Run `python -m http.server 8000` in the directory and open `http://localhost:8000`.
   - Node: Run `npx serve` and open the provided URL.

## How to Use

1. **Enter Dynamic Version**: Type your subject line with dynamic variables in standard formats, e.g.:
   - Personalization: `%%Retail_StoreName%%`
   - Inline script: `%%=v(@Retail_StoreName)=%%`
   - Handlebars: `{{Retail_StoreName}}`
2. **Enter Fallback Version**: Type what the subject line should display if the variable is blank or missing.
3. **Select Primary Variable**: If multiple variables exist in the mismatch, select the primary one to check.
4. **Generate & Copy**:
   - Tab over to **Inline Subject Line** or **Block AMPscript** and click the copy button.
5. **Simulate**: Test different value states in the **Simulator Control Panel** and watch the mock inbox notification update instantly.

## Developer Best Practices

- **Block AMPscript is Recommended**: Wrapping AMPscript directly in the subject line field can sometimes cause encoding issues, character limit truncation, or syntax parsing failures during complex preview sends. Storing it in an body variable (`@subjectLine`) and outputting `%%=v(@subjectLine)=%%` in the subject line is highly recommended.
- **Null Safety**: The generated Block AMPscript automatically wraps retrievals in `AttributeValue("VariableName")`. This prevents runtime send errors if a Data Extension is missing the field entirely.
