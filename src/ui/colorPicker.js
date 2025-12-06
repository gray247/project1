function openColorPicker(initialColor = "#ffffff") {
    return new Promise((resolve) => {
        // Remove existing modal if present
        const existing = document.getElementById("color-picker-modal");
        if (existing) existing.remove();

        // Modal overlay
        const overlay = document.createElement("div");
        overlay.id = "color-picker-modal";
        overlay.style.position = "fixed";
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = "100vw";
        overlay.style.height = "100vh";
        overlay.style.background = "rgba(0,0,0,0.35)";
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.zIndex = 9999;

        // Modal box
        const box = document.createElement("div");
        box.style.background = "white";
        box.style.padding = "24px";
        box.style.borderRadius = "12px";
        box.style.boxShadow = "0 8px 20px rgba(0,0,0,0.25)";
        box.style.minWidth = "300px";
        box.style.textAlign = "center";

        // Label
        const label = document.createElement("div");
        label.textContent = "Select Color";
        label.style.fontSize = "18px";
        label.style.marginBottom = "20px";

        // *** Real native color picker ***
        const picker = document.createElement("input");
        picker.type = "color";
        picker.value = initialColor;
        picker.style.width = "100%";
        picker.style.height = "48px";
        picker.style.border = "1px solid #ccc";
        picker.style.borderRadius = "8px";
        picker.style.cursor = "pointer";
        picker.style.marginBottom = "20px";

        // Buttons
        const buttons = document.createElement("div");
        buttons.style.display = "flex";
        buttons.style.justifyContent = "space-between";

        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.style.padding = "8px 16px";
        cancel.onclick = () => {
            overlay.remove();
            resolve(null);
        };

        const save = document.createElement("button");
        save.textContent = "Save";
        save.style.padding = "8px 16px";
        save.onclick = () => {
            overlay.remove();
            resolve(picker.value);
        };

        buttons.appendChild(cancel);
        buttons.appendChild(save);

        // Build UI
        box.appendChild(label);
        box.appendChild(picker);
        box.appendChild(buttons);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

module.exports = { openColorPicker };
