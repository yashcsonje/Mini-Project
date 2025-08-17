document.addEventListener("DOMContentLoaded", () => {
    // ✅ Initialize datasets before WebSocket connection
    const voltageData = { labels: [], R: [], Y: [], B: [] };  // Three-phase voltage
    const currentData = { labels: [], R: [], Y: [], B: [] };  // Three-phase current
    const thdData = { labels: [], powerFactor: [], thd: [] }; // Power Factor & THD
    
    
    // ✅ Initialize WebSocket
    const ws = new WebSocket("ws://localhost:8080");

    // ✅ Select HTML elements for displaying data
    const voltageElement = document.getElementById("voltage");
    const currentElement = document.getElementById("current");
    const powerElement = document.getElementById("avg-active-power");
    const pfElement = document.getElementById("powerFactor");
    const frequencyElement = document.getElementById("frequency"); // ✅ Added frequency element
    const avgVoltageElement = document.getElementById("avg-voltage");
    const avgActivePowerElement = document.getElementById("total-active-power");
    const avgPowerFactorElement = document.getElementById("avg-power-factor");
    
    let connectionCheck = setTimeout(() => {
        console.warn("⚠️ Connection closed almost immediately after opening.");
    }, 2000);

    ws.onopen = () => {
        console.log("✅ Connected to WebSocket server");
        clearTimeout(connectionCheck);
        ws.send(JSON.stringify({ message: "Hello Server!" }));
    };

    ws.onmessage = (event) => {
        let message = event.data;
        try {
            if (!message || message.length === 0) {
                console.warn("⚠️ Received empty message, ignoring.");
                return;
            }
        
            if (typeof message !== "string") {
                console.warn("⚠️ Received non-string message:", message);
                return;
            }
        
            const parsedMessage = JSON.parse(event.data);

        
            if (parsedMessage.data && parsedMessage.data.type === "Buffer") {
                parsedMessage.data = Buffer.from(parsedMessage.data.data).toString("utf-8");
            }
        
        // Ensure `parsedMessage.data` is a string before using match()
        if (typeof parsedMessage.data !== "string") {
            console.warn("⚠️ `parsedMessage.data` is not a string. Converting...");
            parsedMessage.data = JSON.stringify(parsedMessage.data);
        }

        console.log("📌 Type of `parsedMessage.data`:", typeof parsedMessage.data, "| Value:", parsedMessage.data);

            const registerDataMatch = parsedMessage.data.match(/\[([\d.,-nan\s]+)\]/);
            if (!registerDataMatch) {
                console.warn("⚠️ No register data found in message.");
                return;
            }
        
            const registerValues = registerDataMatch[1]
                .split(",")
                .map(value => (value.includes("nan") ? 0 : parseFloat(value.trim())));
        
            console.log("📊 Extracted Register Data:", registerValues);
        
            let powerFactor = null, current = null, voltage = null, frequency = null, thd = null, activePower = null;
        
            if (!Array.isArray(registerValues) || registerValues.length === 0) {
                console.warn("⚠️ No valid data found.");
            } else {
                switch (registerValues.length) {
                    case 1:
                        if (registerValues[0] >= 0 && registerValues[0] <= 1) {
                            powerFactor = registerValues[0];
                        } else if (registerValues[0] >= 40 && registerValues[0] <= 60) {
                            frequency = registerValues[0];
                        } else {
                            console.warn("⚠️ Unknown single value:", registerValues[0]);
                        }
                        break;
        
                    case 2:
                        [powerFactor, thd] = registerValues;
                        powerFactor = (powerFactor >= 0 && powerFactor <= 1) ? powerFactor : null;
                        thd = (thd >= 0 && thd <= 100) ? thd : null;
                        break;
        
                    case 3:
                        console.log("🔍 Checking 3-element array:", registerValues);
                        const hasCorruptData = registerValues.some(v => v > 1000000 || isNaN(v));
                        if (hasCorruptData) {
                            console.warn("⚠️ Corrupt data detected:", registerValues);
                            break;
                        }
        
                        const isVoltage = registerValues.some(v => v >= 200 && v <= 500);
                        const isCurrent = registerValues.every(c => c >= 0 && c <=100);
        
                        if (isVoltage) voltage = { R: registerValues[0], Y: registerValues[1], B: registerValues[2] };
                        if (isCurrent) current = { R: registerValues[0], Y: registerValues[1], B: registerValues[2] };
                        break;
        
                    default:
                        activePower = registerValues.find(p => p >= 50 && p <= 50000) || null;
                        if (activePower) {
                            console.log("⚡ Active Power detected:", activePower);
                        } else {
                            console.warn("⚠️ No Active Power detected. Data might be corrupt.");
                        }
                        break;
                }
            }
        
            // ✅ UI Update with correct object properties
            if (pfElement && powerFactor !== null) pfElement.innerText = `${powerFactor.toFixed(2)}`;
            if (voltageElement && voltage) voltageElement.innerText = `R: ${voltage.R} V\n, Y: ${voltage.Y} V\n, B: ${voltage.B} V\n`;
            if (currentElement && current) currentElement.innerText = `R: ${current.R} A, Y: ${current.Y} A, B: ${current.B} A`;
            if (frequencyElement && frequency !== null) frequencyElement.innerText = `Frequency: ${frequency.toFixed(2)} Hz`;
            if (avgVoltageElement && voltage) avgVoltageElement.innerText = `Avg Voltage: ${((voltage.R + voltage.Y + voltage.B) / 3).toFixed(2)} V`;
            if (avgPowerFactorElement && powerFactor !== null) avgPowerFactorElement.innerText = `Avg Power Factor: ${powerFactor.toFixed(2)}`;
            if (avgActivePowerElement && activePower !== null) avgActivePowerElement.innerText = `Avg Active Power: ${activePower.toFixed(2)} W`;
        
            function calculateTHD(harmonics) {
                if (!Array.isArray(harmonics) || harmonics.length < 2) {
                    console.warn("⚠️ Invalid harmonics data for THD calculation.");
                    return "N/A";
                }
        
                const fundamental = harmonics[0];
                if (fundamental === 0) {
                    console.warn("⚠️ Fundamental component (V1) is zero, cannot calculate THD.");
                    return "N/A";
                }
        
                const harmonicSum = harmonics.slice(1).reduce((sum, v) => sum + v ** 2, 0);
                return ((Math.sqrt(harmonicSum) / fundamental) * 100).toFixed(2);
            }
        
            const sampleHarmonics = [230, 5, 3, 2, 1];
            const thdValue = calculateTHD(sampleHarmonics);
            console.log("⚡ Total Harmonic Distortion (THD):", thdValue ? `${thdValue}%` : "N/A");
        
            const timestamp = new Date().toLocaleTimeString();
            if (voltage) {
                updateChart(voltageChart, voltageData, timestamp, {
                    R: voltage.R,
                    Y: voltage.Y,
                    B: voltage.B
                });
                            }
            if (current) {
                updateChart(currentChart, currentData, timestamp, {
                    R: current.R,
                    Y: current.Y,
                    B: current.B
                });            }
            if (powerFactor !== null && thd !== null) {
                updateChart(thdChart, thdData, timestamp, {
                    powerFactor: powerFactor,
                    thd: thd
                });            }
        } catch (error) {
            console.error("❌ Error handling message:", error);
        }
        
    };

    ws.onclose = (event) => {
        console.warn("❌ WebSocket Disconnected", event);
        if (event.wasClean) {
            console.log(`✅ Connection closed cleanly, code=${event.code}, reason=${event.reason}`);
        } else {
            console.error("⚠️ Connection closed unexpectedly");
        }
    };

    ws.onerror = (error) => {
        console.error("❌ WebSocket Error:", error);
    };

    
    function updateChart(chart, dataset, timestamp, newValues) {
        if (!chart || typeof chart.update !== "function") {
            console.error("❌ Invalid chart instance.");
            return;
        }
    
        if (!dataset || !dataset.labels || typeof dataset !== "object") {
            console.error("❌ Invalid dataset:", dataset);
            return;
        }
    
        dataset.labels.push(timestamp);
    
        Object.keys(newValues).forEach((key) => {
            if (!dataset[key]) dataset[key] = []; // Ensure dataset key exists
            dataset[key].push(newValues[key]);
    
            // Keep only the latest 20 points
            if (dataset[key].length > 20) {
                dataset[key].shift();
            }
        });
    
        if (dataset.labels.length > 20) {
            dataset.labels.shift();
        }
    
        chart.update();
    }
    
    function sendMessage() {
        const message = document.getElementById("messageInput").value;
        ws.send(message);
        console.log("📤 Sent:", message);
    }
    
    const voltageChart = new Chart(document.getElementById("voltageChart"), {
        type: "line",
        data: {
            labels: voltageData.labels,
            datasets: [
                { label: "R Phase Voltage (V)", data: voltageData.R, borderColor: "red", borderWidth: 1.5, fill: false },
                { label: "Y Phase Voltage (V)", data: voltageData.Y, borderColor: "yellow", borderWidth: 1.5, fill: false },
                { label: "B Phase Voltage (V)", data: voltageData.B, borderColor: "blue", borderWidth: 1.5, fill: false }
            ]
        },
        options: { responsive: true,maintainAspectRatio: false,scales: { x: { title: { text: "Time", display: true } }, y: { title: { text: "Voltage (V)", display: true } } } }
    });
    
    const currentChart = new Chart(document.getElementById("currentChart"), {
        type: "line",
        data: {
            labels: currentData.labels,
            datasets: [
                { label: "R Phase Current (A)", data: currentData.R, borderColor: "red", borderWidth: 1.5, fill: false },
                { label: "Y Phase Current (A)", data: currentData.Y, borderColor: "orange", borderWidth: 1.5, fill: false },
                { label: "B Phase Current (A)", data: currentData.B, borderColor: "blue", borderWidth: 1.5, fill: false }
            ]
        },
        options: { responsive: true, scales: { x: { title: { text: "Time", display: true } }, y: { title: { text: "Current (A)", display: true } } } }
    });
    
    // const thdChart = new Chart(document.getElementById("thdChart"), {
    //     type: "line",
    //     data: {
    //         labels: thdData.labels,
    //         datasets: [
    //             { label: "Power Factor", data: thdData.powerFactor, borderColor: "green", borderWidth: 1.5, fill: false },
    //             { label: "THD (%)", data: thdData.thd, borderColor: "purple", borderWidth: 1.5, fill: false }
    //         ]
    //     },
    //     options: { responsive: true, scales: { x: { title: { text: "Time", display: true } }, y: { title: { text: "Value", display: true } } } }
    // });
    
});
document.addEventListener("DOMContentLoaded", function () {
    const sidebar = document.querySelector(".sidebar");
    const toggleButton = document.getElementById("toggleSidebar");
    const mainContent = document.querySelector(".main-content");

    // Function to toggle sidebar state
    function toggleSidebar() {
        sidebar.classList.toggle("collapsed");
        mainContent.classList.toggle("expanded");
        toggleButton.classList.toggle("rotated");

        // Store state in localStorage
        localStorage.setItem("sidebarCollapsed", sidebar.classList.contains("collapsed"));
    }

    // Event listener for the toggle button
    toggleButton.addEventListener("click", toggleSidebar);

    // Load sidebar state from localStorage
    const isSidebarCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
    if (isSidebarCollapsed) {
        sidebar.classList.add("collapsed");
        mainContent.classList.add("expanded");
        toggleButton.classList.add("rotated");
    }

    // Optional: Close sidebar on small screens when clicking outside
    document.addEventListener("click", function (event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnToggleButton = toggleButton.contains(event.target);

        if (!isClickInsideSidebar && !isClickOnToggleButton && window.innerWidth <= 768) {
            sidebar.classList.add("collapsed");
            mainContent.classList.add("expanded");
            toggleButton.classList.add("rotated");
            localStorage.setItem("sidebarCollapsed", true);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('dark-mode-toggle');
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
    });
  });
  