"use strict";

/* =========================
   CONFIGURACIÓN
========================= */

const DAYS = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo"
];

const DEFAULT_ACTIVITY = () => ({});
const CLASS_API_URL =
    document
        .querySelector('meta[name="study-hub-api"]')
        ?.content
        .replace(/\/+$/, "") || "";


/* =========================
   ESTADO
========================= */

let accounts =
    readJSON("studyAccounts",[]);

let currentAccount =
    localStorage.getItem(
        "studyCurrentAccount"
    ) || null;

let currentPage = "home";

let historyPages = ["home"];

let historyIndex = 0;

let currentFilter = "all";

let tasks = [];

let hours = 0;

let activity =
    DEFAULT_ACTIVITY();

let chartWeekOffset = 0;

let boardData = "";

let canvas = null;

let ctx = null;

let drawing = false;

let tool = "pen";

let undoStack = [];

let redoStack = [];


/* =========================
   USUARIOS / CLASES
========================= */

let selectedRole = null;

let studyUsers =
    readJSON(
        "studyUsers",
        []
    );

let studyClasses =
    readJSON(
        "studyClasses",
        []
    );

// Beta institution allowlist: replace these two sample domains with confirmed institutions.
const INSTITUTIONS = [
    {
        domain:"innovaschools.edu.pe",
        name:"Innova Schools"
    },
    {
        domain:"trilce.edu.pe",
        name:"Trilce Perú"
    }
];

const INSTITUTION_ROOMS = [
    "SM2 - Aula A",
    "SM2 - Aula B",
    "SM2 - Aula C",
    "SM2 - Aula D"
];

const INSTITUTION_COURSES = [
    "Matemática",
    "Comunicación",
    "Ciencia",
    "Historia",
    "Inglés"
];


/* =========================
   LOCAL STORAGE
========================= */

function readJSON(key,fallback){

    try{

        const raw =
            localStorage.getItem(key);

        return raw
            ? JSON.parse(raw)
            : fallback;

    }catch(error){

        return fallback;

    }

}


function writeJSON(key,value){

    localStorage.setItem(
        key,
        JSON.stringify(value)
    );

}


function accountKey(suffix){

    if(currentAccount){

        return (
            "study_" +
            currentAccount +
            "_" +
            suffix
        );

    }

    return "study_guest_" + suffix;

}


/* =========================
   COPIAS DE SEGURIDAD
========================= */

const BACKUP_FORMAT = "study-hub-backup";
const BACKUP_VERSION = 1;


function isStudyHubStorageKey(key){

    return (
        /^(studyAccounts|studyCurrentAccount|studyUsers|studyClasses)$/.test(key) ||
        /^study_(guest|\d+)_(tasks|hours|activity|board)$/.test(key)
    );

}


function getStudyHubStorageEntries(){

    const entries = [];

    for(let index = 0; index < localStorage.length; index++){

        const key =
            localStorage.key(index);

        if(key && isStudyHubStorageKey(key)){

            entries.push([
                key,
                localStorage.getItem(key)
            ]);

        }

    }

    return entries;

}


function exportBackup(){

    try{

        const backup = {
            format:BACKUP_FORMAT,
            version:BACKUP_VERSION,
            createdAt:new Date().toISOString(),
            data:getStudyHubStorageEntries()
        };

        const file = new Blob(
            [JSON.stringify(backup, null, 2)],
            {type:"application/json"}
        );

        const url =
            URL.createObjectURL(file);

        const link =
            document.createElement("a");

        link.href = url;
        link.download =
            `study-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(
            () => URL.revokeObjectURL(url),
            1000
        );

        toast(
            "Copia de seguridad descargada."
        );

    }catch(error){

        console.error(
            "No se pudo crear la copia de seguridad:",
            error
        );

        toast(
            "No se pudo crear la copia de seguridad."
        );

    }

}


function validateBackup(backup){

    if(
        !backup ||
        backup.format !== BACKUP_FORMAT ||
        backup.version !== BACKUP_VERSION ||
        !Array.isArray(backup.data)
    ){

        return false;

    }

    const keys = new Set();

    return backup.data.every(
        entry => {

            if(
                !Array.isArray(entry) ||
                entry.length !== 2 ||
                typeof entry[0] !== "string" ||
                typeof entry[1] !== "string" ||
                !isStudyHubStorageKey(entry[0]) ||
                keys.has(entry[0])
            ){

                return false;

            }

            keys.add(entry[0]);

            return true;

        }
    );

}


function replaceStudyHubStorage(entries){

    const previousEntries =
        getStudyHubStorageEntries();

    try{

        previousEntries.forEach(
            ([key]) =>
                localStorage.removeItem(key)
        );

        entries.forEach(
            ([key, value]) =>
                localStorage.setItem(key, value)
        );

    }catch(error){

        try{

            getStudyHubStorageEntries().forEach(
                ([key]) =>
                    localStorage.removeItem(key)
            );

            previousEntries.forEach(
                ([key, value]) =>
                    localStorage.setItem(key, value)
            );

        }catch(rollbackError){

            console.error(
                "No se pudieron recuperar los datos anteriores tras fallar la restauración:",
                rollbackError
            );

        }

        throw error;

    }

}


async function restoreBackupFile(file){

    try{

        const backup =
            JSON.parse(await file.text());

        if(!validateBackup(backup)){

            toast(
                "El archivo no es una copia válida de Study Hub."
            );

            return;

        }

        if(
            !confirm(
                "Restaurar esta copia reemplazará todas las cuentas y los datos actuales de Study Hub en este navegador. ¿Quieres continuar?"
            )
        ){

            return;

        }

        replaceStudyHubStorage(backup.data);

        location.reload();

    }catch(error){

        console.error(
            "No se pudo restaurar la copia de seguridad:",
            error
        );

        toast(
            "No se pudo leer o restaurar la copia de seguridad."
        );

    }

}


/* =========================
   CARGAR DATOS
========================= */

function loadUserData(){

    tasks =
        readJSON(
            accountKey("tasks"),
            []
        );

    hours =
        Number(
            localStorage.getItem(
                accountKey("hours")
            ) || 0
        );

    const savedActivity =
        readJSON(
            accountKey("activity"),
            {}
        ) || {};

    activity = {};

    Object.entries(savedActivity).forEach(
        ([date,value]) => {

            const hoursForDate = Number(value);

            if(
                /^\d{4}-\d{2}-\d{2}$/.test(date) &&
                Number.isFinite(hoursForDate) &&
                hoursForDate >= 0
            ){

                activity[date] =
                    Math.round(hoursForDate * 10) / 10;

            }

        }
    );

    const currentWeekStart =
        getWeekStart(new Date());

    DAYS.forEach((day,index) => {

        const legacyHours =
            Number(savedActivity[day]);

        if(
            Object.prototype.hasOwnProperty.call(
                savedActivity,
                day
            ) &&
            Number.isFinite(legacyHours) &&
            legacyHours >= 0
        ){

            const date =
                new Date(currentWeekStart);

            date.setDate(
                date.getDate() + index
            );

            const key =
                getDateKey(date);

            if(activity[key] === undefined){
                activity[key] =
                    Math.round(legacyHours * 10) / 10;
            }

        }

    });

    boardData =
        localStorage.getItem(
            accountKey("board")
        ) || "";

}


/* =========================
   GUARDAR DATOS
========================= */

function saveUserData(){

    writeJSON(
        accountKey("tasks"),
        tasks
    );

    localStorage.setItem(
        accountKey("hours"),
        String(hours)
    );

    writeJSON(
        accountKey("activity"),
        activity
    );

    if(
        canvas &&
        canvas.width > 0 &&
        canvas.height > 0
    ){

        localStorage.setItem(
            accountKey("board"),
            canvas.toDataURL("image/png")
        );

    }

}


/* =========================
   INICIALIZACIÓN
========================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setupNavigation();

        setupFilters();

        setupCanvas();

        loadUserData();

        loadProfile();

        renderAccounts();

        renderAll();

        renderStudyUser();

        renderClasses();

        document
            .getElementById("backupFileInput")
            .addEventListener(
                "change",
                event => {

                    const input =
                        event.currentTarget;

                    const file =
                        input.files[0];

                    if(file){
                        restoreBackupFile(file);
                    }

                    input.value = "";

                }
            );

    }
);


/* =========================
   ENTRAR
========================= */

function enterApp(){

    document.getElementById(
        "landing"
    ).style.display = "none";

    document.getElementById(
        "app"
    ).classList.add("active");

    showPage("home",true);

}


/* =========================
   NAVEGACIÓN
========================= */

function setupNavigation(){

    document
        .querySelectorAll(".nav")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    showPage(
                        button.dataset.page
                    );

                    document
                        .getElementById("sidebar")
                        .classList.remove("open");

                }
            );

        });

}


function showPage(
    page,
    fromHistory = false
){

    if(
        !fromHistory &&
        page !== currentPage
    ){

        historyPages =
            historyPages.slice(
                0,
                historyIndex + 1
            );

        historyPages.push(page);

        historyIndex++;

    }

    currentPage = page;

    document
        .querySelectorAll(".page")
        .forEach(section => {

            section.classList.remove("active");

        });

    const target =
        document.getElementById(
            "page-" + page
        );

    if(target){
        target.classList.add("active");
    }

    document
        .querySelectorAll(".nav")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.page === page
            );

        });

    const names = {

        home:[
            "Inicio",
            "Tu centro de estudio."
        ],

        organizer:[
            "Organizador",
            "Un espacio para planificar tu estudio."
        ],

        pending:[
            "Pendientes",
            "Tareas que todavía debes completar."
        ],

        board:[
            "Pizarra",
            "Escribe y dibuja tus ideas."
        ],

        ai:[
            "Asistente IA",
            "Tu espacio de ayuda."
        ],

        users:[
            "Sistema de usuarios",
            "Administra tus datos y preferencias."
        ],

        performance:[
            "Rendimiento",
            "Observa y modifica tu progreso."
        ],

        profile:[
            "Perfil",
            "Tu cuenta y preferencias."
        ],

        coming:[
            "Próximamente",
            "Nuevas funciones de Study Hub."
        ],

    };

    if(names[page]){

        document.getElementById(
            "title"
        ).textContent =
            names[page][0];

        document.getElementById(
            "description"
        ).textContent =
            names[page][1];

    }

    if(page === "board"){

        requestAnimationFrame(
            () => {

                resizeCanvas(true);

            }
        );

    }

}


function toggleMenu(){

    document
        .getElementById("sidebar")
        .classList.toggle("open");

}


/* =========================
   TAREAS
========================= */

function saveTasks(){

    writeJSON(
        accountKey("tasks"),
        tasks
    );

}


function openTask(){

    document
        .getElementById("taskModal")
        .classList.add("open");

}


function closeTask(){

    document
        .getElementById("taskModal")
        .classList.remove("open");

}


function createTask(){

    const name =
        document
            .getElementById("taskName")
            .value
            .trim();

    if(!name){

        toast(
            "Escribe el nombre de la tarea."
        );

        return;

    }

    tasks.push({

        id:Date.now(),

        name:name,

        subject:
            document
                .getElementById("taskSubject")
                .value,

        date:
            document
                .getElementById("taskDate")
                .value,

        completed:false

    });

    saveTasks();

    renderAll();

    document.getElementById(
        "taskName"
    ).value = "";

    document.getElementById(
        "taskDate"
    ).value = "";

    closeTask();

    toast(
        "Tarea creada."
    );

}


function toggleTask(id){

    tasks =
        tasks.map(task => {

            if(task.id === id){

                return {
                    ...task,
                    completed:
                        !task.completed
                };

            }

            return task;

        });

    saveTasks();

    renderAll();

}


function deleteTask(id){

    tasks =
        tasks.filter(
            task => task.id !== id
        );

    saveTasks();

    renderAll();

    toast(
        "Tarea eliminada."
    );

}


/* =========================
   ORDENAR
========================= */

function sortTasks(list){

    return [...list].sort(
        (a,b) => {

            if(!a.date && !b.date){
                return 0;
            }

            if(!a.date){
                return 1;
            }

            if(!b.date){
                return -1;
            }

            return (
                new Date(a.date) -
                new Date(b.date)
            );

        }
    );

}


/* =========================
   MOSTRAR TAREAS
========================= */

function taskHTML(task){

    const safeName =
        escapeHTML(task.name);

    const safeSubject =
        escapeHTML(task.subject);

    return `

        <div class="task ${task.completed ? "done" : ""}">

            <button
                class="check ${task.completed ? "done" : ""}"
                onclick="toggleTask(${task.id})">

                ${task.completed ? "✓" : ""}

            </button>

            <div class="task-info">

                <div class="task-name">
                    ${safeName}
                </div>

                <div class="task-meta">

                    <span>
                        ${safeSubject}
                    </span>

                    <span>
                        ${
                            task.date
                            ? formatDate(task.date)
                            : "Sin fecha"
                        }
                    </span>

                </div>

            </div>

            <button
                class="delete"
                onclick="deleteTask(${task.id})">

                ×

            </button>

        </div>

    `;

}


function renderTasks(){

    let filtered = tasks;

    if(currentFilter === "pending"){

        filtered =
            tasks.filter(
                task => !task.completed
            );

    }

    if(currentFilter === "completed"){

        filtered =
            tasks.filter(
                task => task.completed
            );

    }

    filtered =
        sortTasks(filtered);

    document.getElementById(
        "organizerTasks"
    ).innerHTML =

        filtered.length

        ? filtered.map(taskHTML).join("")

        : `
            <div class="card">
                No hay tareas aquí.
            </div>
        `;


    const pending =
        sortTasks(
            tasks.filter(
                task => !task.completed
            )
        );


    document.getElementById(
        "pendingTasks"
    ).innerHTML =

        pending.length

        ? pending.map(taskHTML).join("")

        : `
            <div class="card">
                🎉 No tienes tareas pendientes.
            </div>
        `;


    const nextTasks =
        pending.slice(0,4);


    document.getElementById(
        "homeTasks"
    ).innerHTML =

        nextTasks.length

        ? nextTasks.map(taskHTML).join("")

        : `
            <div class="card">
                No tienes tareas próximas.
            </div>
        `;


    document.getElementById(
        "pendingCount"
    ).textContent =
        pending.length;

}


function setupFilters(){

    document
        .querySelectorAll(".filter")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".filter")
                        .forEach(
                            item =>
                                item.classList.remove("active")
                        );

                    button.classList.add("active");

                    currentFilter =
                        button.dataset.filter;

                    renderTasks();

                }
            );

        });

}


function formatDate(dateString){

    const date =
        new Date(
            dateString + "T00:00:00"
        );

    return date.toLocaleDateString(
        "es-PE",
        {
            day:"2-digit",
            month:"2-digit",
            year:"numeric"
        }
    );

}


function getDateKey(date){

    const year =
        date.getFullYear();

    const month =
        String(date.getMonth() + 1).padStart(2,"0");

    const day =
        String(date.getDate()).padStart(2,"0");

    return `${year}-${month}-${day}`;

}


function getWeekStart(date){

    const start =
        new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );

    start.setDate(
        start.getDate() -
        (start.getDay() + 6) % 7
    );

    return start;

}


/* =========================
   RENDIMIENTO
========================= */

function updateStats(){

    const total =
        tasks.length;

    const completed =
        tasks.filter(
            task => task.completed
        ).length;

    const pending =
        total - completed;

    const percent =
        total
        ? Math.round(
            completed / total * 100
        )
        : 0;

    document.getElementById(
        "completedHome"
    ).textContent =
        completed;

    document.getElementById(
        "pendingHome"
    ).textContent =
        pending;

    document.getElementById(
        "percentageHome"
    ).textContent =
        percent + "%";

    document.getElementById(
        "hoursHome"
    ).textContent =
        hours;

    document.getElementById(
        "performancePercent"
    ).textContent =
        percent + "%";

    document.getElementById(
        "performanceCompleted"
    ).textContent =
        completed;

    document.getElementById(
        "performancePending"
    ).textContent =
        pending;

    document.getElementById(
        "progress"
    ).style.width =
        percent + "%";

    document.getElementById(
        "totalHours"
    ).textContent =
        hours;

}


/* =========================
   HORAS
========================= */

function getHourInput(){

    const value =
        Number(
            document.getElementById(
                "hourInput"
            ).value
        );

    if(
        !Number.isFinite(value) ||
        value <= 0
    ){

        toast(
            "Coloca una cantidad válida."
        );

        return null;

    }

    return value;

}


function addHours(){

    const value =
        getHourInput();

    if(value === null){
        return;
    }

    hours =
        Math.round(
            (hours + value) * 10
        ) / 10;

    const today =
        getDateKey(new Date());

    activity[today] =
        Math.round(
            ((Number(activity[today]) || 0) + value) * 10
        ) / 10;

    saveUserData();

    updateStats();

    renderChart();

    document.getElementById(
        "hourInput"
    ).value = "";

    toast(
        "Horas añadidas."
    );

}


function subtractHours(){

    const value =
        getHourInput();

    if(value === null){
        return;
    }

    hours =
        Math.max(
            0,
            Math.round(
                (hours - value) * 10
            ) / 10
        );

    const today =
        getDateKey(new Date());

    activity[today] =
        Math.max(
            0,
            Math.round(
                ((Number(activity[today]) || 0) - value) * 10
            ) / 10
        );

    saveUserData();

    updateStats();

    renderChart();

    document.getElementById(
        "hourInput"
    ).value = "";

    toast(
        "Horas restadas."
    );

}


function editHours(){

    const value =
        prompt(
            "¿Cuántas horas quieres tener en total?",
            hours
        );

    if(value === null){
        return;
    }

    const number =
        Number(value);

    if(
        !Number.isFinite(number) ||
        number < 0
    ){

        toast(
            "Cantidad inválida."
        );

        return;

    }

    hours =
        Math.round(
            number * 10
        ) / 10;

    saveUserData();

    updateStats();

    toast(
        "Total actualizado."
    );

}


function resetHours(){

    if(
        !confirm(
            "¿Seguro que quieres reiniciar tus horas a 0?"
        )
    ){

        return;

    }

    hours = 0;

    saveUserData();

    updateStats();

    toast(
        "Horas reiniciadas a 0."
    );

}


/* =========================
   GRÁFICO
========================= */

function renderChart(){

    const chart =
        document.getElementById(
            "chart"
        );

    chart.innerHTML = "";

    const weekStart =
        getWeekStart(new Date());

    weekStart.setDate(
        weekStart.getDate() +
        chartWeekOffset * 7
    );

    const weekEnd =
        new Date(weekStart);

    weekEnd.setDate(
        weekEnd.getDate() + 6
    );

    document.getElementById(
        "chartWeekLabel"
    ).textContent =
        (chartWeekOffset === 0 ? "Esta semana · " : "") +
        formatDate(getDateKey(weekStart)) +
        " – " +
        formatDate(getDateKey(weekEnd));

    document.getElementById(
        "nextChartWeek"
    ).disabled =
        chartWeekOffset === 0;

    const today =
        getDateKey(new Date());

    const weekDays =
        DAYS.map((day,index) => {

            const date =
                new Date(weekStart);

            date.setDate(
                date.getDate() + index
            );

            const key =
                getDateKey(date);

            return {
                date,
                key,
                day,
                value:Number(activity[key]) || 0
            };

        });

    const max =
        Math.max(
            1,
            ...weekDays.map(item => item.value)
        );

    weekDays.forEach(({date,key,day,value}) => {

        const container =
            document.createElement("div");

        container.className = "day";

        const isFuture =
            key > today;

        const barHeight =
            Math.max(
                value ? 4 : 1,
                value / max * 100
            );

        const barArea =
            document.createElement("div");

        barArea.className = "barArea";

        const bar =
            document.createElement("div");

        bar.className = "bar";
        bar.style.height = barHeight + "%";
        bar.title =
            `${value.toLocaleString("es-PE")} h · ${formatDate(key)}`;

        barArea.appendChild(bar);

        const label =
            document.createElement("button");

        label.type = "button";
        label.disabled = isFuture;
        label.setAttribute(
            "aria-label",
            `${day} ${formatDate(key)}: ${value} horas` +
            (isFuture ? "" : ". Selecciona para editar")
        );

        const weekday =
            document.createElement("span");

        weekday.textContent =
            date
                .toLocaleDateString(
                    "es-PE",
                    {weekday:"short"}
                )
                .replace(/\.$/,"");

        const dayNumber =
            document.createElement("span");

        dayNumber.textContent =
            date.getDate();

        label.append(
            weekday,
            dayNumber
        );

        if(!isFuture){
            label.addEventListener(
                "click",
                () => editDay(key)
            );
        }

        container.append(
            barArea,
            label
        );

        chart.appendChild(container);

    });

}


function changeChartWeek(direction){

    chartWeekOffset =
        Math.min(
            0,
            chartWeekOffset + direction
        );

    renderChart();

}


function editDay(dateKey){

    const date =
        new Date(dateKey + "T00:00:00");

    const value =
        prompt(
            `Horas estudiadas el ${date.toLocaleDateString("es-PE")}:`,
            activity[dateKey] || 0
        );

    if(value === null){
        return;
    }

    const number =
        Number(value);

    if(
        !Number.isFinite(number) ||
        number < 0
    ){

        toast(
            "Cantidad inválida."
        );

        return;

    }

    activity[dateKey] =
        Math.round(
            number * 10
        ) / 10;

    saveUserData();

    renderChart();

    toast(
        "Horas del día actualizadas."
    );

}


/* =========================
   PIZARRA
========================= */

function setupCanvas(){

    canvas =
        document.getElementById(
            "canvas"
        );

    if(!canvas){
        return;
    }

    ctx =
        canvas.getContext("2d");

    canvas.addEventListener(
        "pointerdown",
        startDraw
    );

    canvas.addEventListener(
        "pointermove",
        draw
    );

    canvas.addEventListener(
        "pointerup",
        stopDraw
    );

    canvas.addEventListener(
        "pointercancel",
        stopDraw
    );

    window.addEventListener(
        "resize",
        () => {

            if(currentPage === "board"){
                resizeCanvas(true);
            }

        }
    );

}


function resizeCanvas(preserve = true){

    if(
        !canvas ||
        canvas.clientWidth === 0 ||
        canvas.clientHeight === 0
    ){

        return;

    }

    const oldCanvas =
        document.createElement("canvas");

    oldCanvas.width =
        canvas.width;

    oldCanvas.height =
        canvas.height;

    if(
        preserve &&
        canvas.width &&
        canvas.height
    ){

        oldCanvas
            .getContext("2d")
            .drawImage(
                canvas,
                0,
                0
            );

    }

    canvas.width =
        canvas.clientWidth;

    canvas.height =
        canvas.clientHeight;

    ctx =
        canvas.getContext("2d");

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if(
        preserve &&
        oldCanvas.width &&
        oldCanvas.height
    ){

        ctx.drawImage(
            oldCanvas,
            0,
            0,
            oldCanvas.width,
            oldCanvas.height,
            0,
            0,
            canvas.width,
            canvas.height
        );

    }
    else if(boardData){

        const image =
            new Image();

        image.onload = () => {

            ctx.drawImage(
                image,
                0,
                0,
                canvas.width,
                canvas.height
            );

        };

        image.src =
            boardData;

    }

}


function point(event){

    const rect =
        canvas.getBoundingClientRect();

    return {

        x:
            event.clientX -
            rect.left,

        y:
            event.clientY -
            rect.top

    };

}


function startDraw(event){

    if(
        !canvas ||
        canvas.clientWidth === 0
    ){

        return;

    }

    if(tool === "text"){

        const text =
            document.getElementById(
                "boardTextInput"
            ).value.trim();

        if(!text){

            toast(
                "Escribe una nota antes de colocarla."
            );

            return;

        }

        const position =
            point(event);

        undoStack.push(
            canvas.toDataURL()
        );

        if(undoStack.length > 30){
            undoStack.shift();
        }

        redoStack = [];

        const fontSize =
            Math.max(
                12,
                Math.min(
                    48,
                    Number(
                        document.getElementById(
                            "size"
                        ).value
                    ) * 4
                )
            );

        const textX =
            Math.min(
                position.x,
                Math.max(8,canvas.width - 24)
            );

        const textY =
            Math.min(
                position.y,
                Math.max(8,canvas.height - fontSize - 8)
            );

        const maxWidth =
            Math.max(
                20,
                canvas.width - textX - 8
            );

        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle =
            document.getElementById(
                "color"
            ).value;
        ctx.font =
            `${fontSize}px "Segoe UI", Arial, sans-serif`;
        ctx.textBaseline = "top";

        let lineNumber = 0;
        const lineHeight = fontSize + 5;

        text.split(/\r?\n/).forEach(line => {

            let currentLine = "";

            line.split(/\s+/).forEach(word => {

                const candidate =
                    currentLine
                    ? currentLine + " " + word
                    : word;

                if(
                    currentLine &&
                    ctx.measureText(candidate).width > maxWidth
                ){

                    ctx.fillText(
                        currentLine,
                        textX,
                        textY + lineNumber * lineHeight,
                        maxWidth
                    );

                    lineNumber++;
                    currentLine = word;

                }else{

                    currentLine = candidate;

                }

            });

            if(currentLine){

                ctx.fillText(
                    currentLine,
                    textX,
                    textY + lineNumber * lineHeight,
                    maxWidth
                );

                lineNumber++;

            }

        });

        ctx.restore();

        boardData =
            canvas.toDataURL();

        localStorage.setItem(
            accountKey("board"),
            boardData
        );

        toast(
            "Nota añadida a la pizarra."
        );

        return;

    }

    drawing = true;

    canvas.setPointerCapture(
        event.pointerId
    );

    undoStack.push(
        canvas.toDataURL()
    );

    if(
        undoStack.length > 30
    ){

        undoStack.shift();

    }

    redoStack = [];

    const position =
        point(event);

    ctx.beginPath();

    ctx.moveTo(
        position.x,
        position.y
    );

}


function draw(event){

    if(!drawing){
        return;
    }

    const position =
        point(event);

    ctx.lineWidth =
        Number(
            document.getElementById(
                "size"
            ).value
        );

    ctx.globalCompositeOperation =
        tool === "eraser"
        ? "destination-out"
        : "source-over";

    ctx.strokeStyle =
        document.getElementById(
            "color"
        ).value;

    ctx.lineTo(
        position.x,
        position.y
    );

    ctx.stroke();

}


function stopDraw(){

    if(!drawing){
        return;
    }

    drawing = false;

    ctx.beginPath();

    boardData =
        canvas.toDataURL();

    localStorage.setItem(
        accountKey("board"),
        boardData
    );

}


function setTool(value){

    tool = value;

    [
        ["pen","pen"],
        ["eraser","eraser"],
        ["textTool","text"]
    ].forEach(([id,toolName]) => {

        document
            .getElementById(id)
            .classList.toggle(
                "active",
                value === toolName
            );

    });

    canvas.style.cursor =
        value === "text"
        ? "text"
        : "crosshair";

}


function restoreImage(data){

    const image =
        new Image();

    image.onload = () => {

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height
        );

        boardData =
            canvas.toDataURL();

        localStorage.setItem(
            accountKey("board"),
            boardData
        );

    };

    image.src = data;

}


function undo(){

    if(!undoStack.length){

        toast(
            "No hay nada para deshacer."
        );

        return;

    }

    redoStack.push(
        canvas.toDataURL()
    );

    restoreImage(
        undoStack.pop()
    );

}


function redo(){

    if(!redoStack.length){

        toast(
            "No hay nada para rehacer."
        );

        return;

    }

    undoStack.push(
        canvas.toDataURL()
    );

    restoreImage(
        redoStack.pop()
    );

}


function clearCanvas(){

    if(
        !confirm(
            "¿Limpiar toda la pizarra?"
        )
    ){

        return;

    }

    undoStack.push(
        canvas.toDataURL()
    );

    redoStack = [];

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    boardData = "";

    localStorage.removeItem(
        accountKey("board")
    );

    toast(
        "Pizarra limpiada."
    );

}


/* =========================
   CUENTAS DEL PERFIL
========================= */

function saveAccount(){

    const name =
        document
            .getElementById("nameInput")
            .value
            .trim();

    const email =
        document
            .getElementById("emailInput")
            .value
            .trim()
            .toLowerCase();

    const grade =
        document
            .getElementById("gradeInput")
            .value;

    if(
        !name ||
        !email ||
        !email.includes("@")
    ){

        toast(
            "Completa un nombre y correo válido."
        );

        return;

    }

    let account =
        accounts.find(
            item =>
                item.email === email
        );

    if(account){

        account.name =
            name;

        account.grade =
            grade;

    }
    else{

        account = {

            id:
                Date.now(),

            name:
                name,

            email:
                email,

            grade:
                grade

        };

        accounts.push(
            account
        );

    }

    writeJSON(
        "studyAccounts",
        accounts
    );

    currentAccount =
        String(account.id);

    localStorage.setItem(
        "studyCurrentAccount",
        currentAccount
    );

    loadUserData();

    loadProfile();

    renderAccounts();

    renderAll();

    requestAnimationFrame(
        () => {

            if(currentPage === "board"){
                resizeCanvas(false);
            }

        }
    );

    toast(
        "Cuenta guardada correctamente."
    );

}


/* =========================
   ELIMINAR CUENTA
========================= */

function deleteCurrentAccount(){

    if(!currentAccount){

        toast(
            "No hay una cuenta activa."
        );

        return;

    }

    const account =
        accounts.find(
            item =>
                String(item.id) ===
                String(currentAccount)
        );

    if(!account){
        return;
    }

    const confirmed =
        confirm(
            `¿Seguro que quieres eliminar la cuenta de "${account.name}"?\n\nSe eliminarán también sus tareas, horas, rendimiento y pizarra de este navegador.`
        );

    if(!confirmed){
        return;
    }

    const prefix =
        "study_" +
        currentAccount +
        "_";

    const keysToDelete = [
        prefix + "tasks",
        prefix + "hours",
        prefix + "activity",
        prefix + "board"
    ];

    keysToDelete.forEach(
        key =>
            localStorage.removeItem(key)
    );

    accounts =
        accounts.filter(
            item =>
                String(item.id) !==
                String(currentAccount)
        );

    writeJSON(
        "studyAccounts",
        accounts
    );

    currentAccount = null;

    localStorage.removeItem(
        "studyCurrentAccount"
    );

    tasks = [];

    hours = 0;

    activity =
        DEFAULT_ACTIVITY();

    boardData = "";

    undoStack = [];

    redoStack = [];

    if(canvas && ctx){

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

    }

    loadProfile();

    renderAccounts();

    renderAll();

    toast(
        "Cuenta eliminada."
    );

}


/* =========================
   PERFIL
========================= */

function loadProfile(){

    const account =
        accounts.find(
            item =>
                String(item.id) ===
                String(currentAccount)
        );

    if(!account){

        document.getElementById(
            "profileName"
        ).textContent =
            "Sin cuenta";

        document.getElementById(
            "profileInfo"
        ).textContent =
            "Crea una cuenta para guardar tus datos por separado.";

        document.getElementById(
            "avatar"
        ).textContent =
            "S";

        document.getElementById(
            "nameInput"
        ).value = "";

        document.getElementById(
            "emailInput"
        ).value = "";

        return;

    }

    document.getElementById(
        "profileName"
    ).textContent =
        account.name;

    document.getElementById(
        "profileInfo"
    ).textContent =
        account.email +
        " · " +
        account.grade;

    document.getElementById(
        "avatar"
    ).textContent =
        account.name
            .charAt(0)
            .toUpperCase();

    document.getElementById(
        "nameInput"
    ).value =
        account.name;

    document.getElementById(
        "emailInput"
    ).value =
        account.email;

    document.getElementById(
        "gradeInput"
    ).value =
        account.grade;

}


function renderAccounts(){

    const box =
        document.getElementById(
            "accounts"
        );

    if(!accounts.length){

        box.innerHTML = `

            <p class="muted">
                Todavía no hay cuentas guardadas.
            </p>

        `;

        return;

    }

    box.innerHTML =
        accounts
            .map(
                account => `

                    <div
                        class="
                        account
                        ${
                            String(account.id) ===
                            String(currentAccount)
                            ? "selected"
                            : ""
                        }">

                        <div>

                            <strong style="font-size:12px">
                                ${escapeHTML(account.name)}
                            </strong>

                            <div class="muted">
                                ${escapeHTML(account.email)}
                            </div>

                            <div
                                class="muted"
                                style="margin-top:3px">
                                ${escapeHTML(account.grade)}
                            </div>

                        </div>

                        <button
                            class="secondary"
                            onclick="selectAccount('${String(account.id)}')">
                            Seleccionar
                        </button>

                    </div>

                `
            )
            .join("");

}


function selectAccount(id){

    currentAccount =
        String(id);

    localStorage.setItem(
        "studyCurrentAccount",
        currentAccount
    );

    loadUserData();

    loadProfile();

    renderAccounts();

    renderAll();

    undoStack = [];

    redoStack = [];

    requestAnimationFrame(
        () => {

            if(currentPage === "board"){
                resizeCanvas(false);
            }

        }
    );

    toast(
        "Cuenta seleccionada."
    );

}


function logout(){

    currentAccount = null;

    localStorage.removeItem(
        "studyCurrentAccount"
    );

    loadUserData();

    loadProfile();

    renderAccounts();

    renderAll();

    toast(
        "Sesión cerrada."
    );

}


/* =========================
   SISTEMA DE USUARIOS
========================= */

function selectRole(role){

    selectedRole = role;

    clearInstitutionDetection();

    document
        .querySelectorAll(".user-type")
        .forEach(
            element =>
                element.classList.remove("selected")
        );

    document
        .getElementById("role-" + role)
        .classList.add("selected");

    document
        .getElementById("userForm")
        .classList.add("open");

    const academicRole =
        role === "teacher" ||
        role === "student";

    document.getElementById(
        "institutionForm"
    ).style.display =
        academicRole
        ? "block"
        : "none";

    document.getElementById(
        "userEmailLabel"
    ).textContent =
        academicRole
        ? "Correo institucional"
        : "Correo electrónico";

    document.getElementById(
        "userEmail"
    ).placeholder =
        academicRole
        ? "tu@institucion.edu.pe"
        : "tu@correo.com";

    const savedUser =
        studyUsers.find(
            user => user.role === role
        );

    if(savedUser){

        document.getElementById(
            "userName"
        ).value =
            savedUser.name;

        document.getElementById(
            "userEmail"
        ).value =
            savedUser.email;

        if(
            academicRole &&
            savedUser.institutionChecked
        ){

            document.getElementById(
                "userEmail"
            ).dataset.institutionChecked =
                "true";

            document.getElementById(
                "userEmail"
            ).dataset.institutionEmail =
                savedUser.email;

            document.getElementById(
                "userEmail"
            ).dataset.institutionDomain =
                savedUser.institutionDomain || "";

            document.getElementById(
                "userEmail"
            ).dataset.institutionName =
                savedUser.institutionName || "";

            renderInstitutionPanel(savedUser);

        }

    }
    else{

        document.getElementById(
            "userName"
        ).value = "";

        document.getElementById(
            "userEmail"
        ).value = "";

    }

    if(
        !savedUser ||
        !savedUser.institutionChecked ||
        !academicRole
    ){
        renderInstitutionPanel();
    }

}


function clearInstitutionDetection(){

    const emailInput =
        document.getElementById("userEmail");

    if(!emailInput){
        return;
    }

    delete emailInput.dataset.institutionChecked;
    delete emailInput.dataset.institutionEmail;
    delete emailInput.dataset.institutionDomain;
    delete emailInput.dataset.institutionName;

    renderInstitutionPanel();

}


function detectInstitution(){

    const email =
        document
            .getElementById("userEmail")
            .value
            .trim()
            .toLowerCase();

    const emailParts =
        email.split("@");

    if(
        emailParts.length !== 2 ||
        !emailParts[1]
    ){

        toast(
            "Escribe un correo institucional válido."
        );

        return;

    }

    const domain =
        emailParts[1];

    const institution =
        INSTITUTIONS.find(
            item =>
                domain === item.domain ||
                domain.endsWith("." + item.domain)
        );

    const emailInput =
        document.getElementById("userEmail");

    emailInput.dataset.institutionChecked =
        "true";

    emailInput.dataset.institutionEmail =
        email;

    emailInput.dataset.institutionDomain =
        domain;

    emailInput.dataset.institutionName =
        institution
        ? institution.name
        : "";

    renderInstitutionPanel({
        role:selectedRole,
        institutionChecked:true,
        institutionDomain:domain,
        institutionName:institution
            ? institution.name
            : ""
    });

}


function renderInstitutionPanel(user = null){

    const panel =
        document.getElementById(
            "institutionPanel"
        );

    const role =
        user
        ? user.role
        : selectedRole;

    const academicRole =
        role === "teacher" ||
        role === "student";

    const emailInput =
        document.getElementById("userEmail");

    const checked =
        user
        ? user.institutionChecked === true
        : emailInput.dataset.institutionChecked === "true" &&
            emailInput.dataset.institutionEmail ===
            emailInput.value.trim().toLowerCase();

    if(!academicRole || !checked){

        panel.style.display = "none";
        panel.innerHTML = "";

        return;

    }

    const institutionName =
        user
        ? user.institutionName
        : emailInput.dataset.institutionName;

    panel.style.display = "block";

    if(!institutionName){

        panel.innerHTML = `
            <h3>Institución educativa</h3>
            <div class="institution-feedback">
                Esta institución todavía no está disponible en la beta.
            </div>
        `;

        return;

    }

    const rooms =
        INSTITUTION_ROOMS.map(
            room => `<li>${escapeHTML(room)}</li>`
        ).join("");

    const courses =
        INSTITUTION_COURSES.map(
            course => `<li>${escapeHTML(course)}</li>`
        ).join("");

    panel.innerHTML = `
        <h3>Institución educativa</h3>
        <p class="muted">
            Institución detectada:
            <strong>${escapeHTML(institutionName)}</strong>
        </p>
        <div class="institution-grid">
            <div class="institution-list">
                <strong>Salones</strong>
                <ul>${rooms}</ul>
            </div>
            <div class="institution-list">
                <strong>Cursos</strong>
                <ul>${courses}</ul>
            </div>
        </div>
    `;

}


function saveStudyUser(){

    if(!selectedRole){

        toast(
            "Primero elige un tipo de usuario."
        );

        return;

    }

    const name =
        document
            .getElementById("userName")
            .value
            .trim();

    const email =
        document
            .getElementById("userEmail")
            .value
            .trim()
            .toLowerCase();

    if(
        !name ||
        !email ||
        !email.includes("@") ||
        !email.includes(".")
    ){

        toast(
            "Escribe un nombre y correo válido."
        );

        return;

    }

    let user =
        studyUsers.find(
            item =>
                item.email === email
        );

    const emailInput =
        document.getElementById("userEmail");

    const institutionChecked =
        selectedRole !== "personal" &&
        emailInput.dataset.institutionChecked === "true" &&
        emailInput.dataset.institutionEmail === email;

    const institutionName =
        institutionChecked
        ? emailInput.dataset.institutionName || ""
        : "";

    const institutionDomain =
        institutionChecked
        ? emailInput.dataset.institutionDomain || ""
        : "";

    if(user){

        user.name =
            name;

        user.role =
            selectedRole;

        user.institutionChecked =
            institutionChecked;

        user.institutionName =
            institutionName;

        user.institutionDomain =
            institutionDomain;

    }
    else{

        user = {

            id:Date.now(),

            name:name,

            email:email,

            role:selectedRole,

            institutionChecked:institutionChecked,

            institutionName:institutionName,

            institutionDomain:institutionDomain

        };

        studyUsers.push(user);

    }

    writeJSON(
        "studyUsers",
        studyUsers
    );

    renderStudyUser();

    renderClasses();

    toast(
        "Usuario guardado correctamente."
    );

}


function roleName(role){

    const names = {

        teacher:"Profesor",

        student:"Estudiante",

        personal:"Usuario personal"

    };

    return names[role] || role;

}


function renderStudyUser(){

    const result =
        document.getElementById(
            "userResult"
        );

    const user =
        getCurrentStudyUser();

    if(!user){

        result.classList.remove("open");

        document.getElementById(
            "teacherPanel"
        ).style.display = "none";

        document.getElementById(
            "studentPanel"
        ).style.display = "none";

        document.getElementById(
            "personalPanel"
        ).style.display = "none";

        document.getElementById(
            "institutionForm"
        ).style.display =
            selectedRole === "teacher" ||
            selectedRole === "student"
            ? "block"
            : "none";

        renderInstitutionPanel();

        return;

    }

    selectedRole =
        user.role;

    document
        .querySelectorAll(".user-type")
        .forEach(
            element =>
                element.classList.remove("selected")
        );

    const roleButton =
        document.getElementById(
            "role-" + user.role
        );

    if(roleButton){
        roleButton.classList.add("selected");
    }

    document.getElementById(
        "userForm"
    ).classList.add("open");

    document.getElementById(
        "userName"
    ).value =
        user.name;

    document.getElementById(
        "userEmail"
    ).value =
        user.email;

    document.getElementById(
        "institutionForm"
    ).style.display =
        user.role === "teacher" ||
        user.role === "student"
        ? "block"
        : "none";

    document.getElementById(
        "userEmailLabel"
    ).textContent =
        user.role === "teacher" ||
        user.role === "student"
        ? "Correo institucional"
        : "Correo electrónico";

    const emailInput =
        document.getElementById("userEmail");

    if(user.institutionChecked){

        emailInput.dataset.institutionChecked =
            "true";

        emailInput.dataset.institutionEmail =
            user.email;

        emailInput.dataset.institutionDomain =
            user.institutionDomain || "";

        emailInput.dataset.institutionName =
            user.institutionName || "";

    }
    else{

        delete emailInput.dataset.institutionChecked;
        delete emailInput.dataset.institutionEmail;
        delete emailInput.dataset.institutionDomain;
        delete emailInput.dataset.institutionName;

    }

    renderInstitutionPanel(user);

    result.classList.add("open");

    result.innerHTML = `

        <div
            style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;">

            <div>

                <strong style="font-size:15px">
                    ${escapeHTML(user.name)}
                </strong>

                <p
                    class="muted"
                    style="margin-top:5px">
                    ${escapeHTML(user.email)}
                </p>

            </div>

            <span class="role-badge">
                ${roleName(user.role)}
            </span>

        </div>

    `;

    document.getElementById(
        "teacherPanel"
    ).style.display =
        user.role === "teacher"
        ? "block"
        : "none";

    document.getElementById(
        "studentPanel"
    ).style.display =
        user.role === "student"
        ? "block"
        : "none";

    document.getElementById(
        "personalPanel"
    ).style.display =
        user.role === "personal"
        ? "block"
        : "none";

}


function getCurrentStudyUser(){

    const email =
        document
            .getElementById("userEmail")
            .value
            .trim()
            .toLowerCase();

    if(!email){
        return null;
    }

    return studyUsers.find(
        user =>
            user.email === email
    ) || null;

}


/* =========================
   CLASES
========================= */

async function classApiRequest(endpoint, options = {}){

    const response =
        await fetch(
            `${CLASS_API_URL}/api/classes${endpoint}`,
            {
                method:options.method || "GET",
                headers:{
                    "Content-Type":"application/json",
                    ...(options.headers || {})
                },
                body:options.body
                    ? JSON.stringify(options.body)
                    : undefined
            }
        );

    const result =
        await response.json();

    if(!response.ok){
        throw new Error(
            result.error || "El servidor rechazó la solicitud."
        );
    }

    return result;

}


function persistStudyUser(){

    writeJSON(
        "studyUsers",
        studyUsers
    );

}


function ensureStudentToken(user){

    if(!user.classStudentToken){

        if(!crypto.randomUUID){
            throw new Error(
                "Este navegador no permite generar un identificador seguro. Abre Study Hub desde localhost o una dirección HTTPS."
            );
        }

        user.classStudentToken =
            crypto.randomUUID();

        persistStudyUser();

    }

    return user.classStudentToken;

}


async function publishLegacyTeacherClasses(user){

    const errors = [];
    const legacyClassIds =
        Array.isArray(user.legacyClassIds)
            ? user.legacyClassIds
            : [];

    const legacyClasses =
        readJSON("studyClasses", []).filter(
            item =>
                item.teacherEmail === user.email &&
                !legacyClassIds.includes(item.id)
        );

    for(const legacyClass of legacyClasses){

        try{

            const result =
                await classApiRequest(
                    "",
                    {
                        method:"POST",
                        body:{
                            name:legacyClass.name,
                            code:legacyClass.code,
                            ownerToken:user.classOwnerToken || ""
                        }
                    }
                );

            user.classOwnerToken =
                result.ownerToken;

            if(!Array.isArray(user.legacyClassIds)){
                user.legacyClassIds = [];
            }

            user.legacyClassIds.push(
                legacyClass.id
            );

            persistStudyUser();

        }catch(error){

            errors.push(
                `${legacyClass.name}: ${error.message}`
            );

        }

    }

    return errors;

}


function openClassModal(){

    const user =
        getCurrentStudyUser();

    if(
        !user ||
        user.role !== "teacher"
    ){

        toast(
            "Debes entrar como profesor."
        );

        return;

    }

    document
        .getElementById("classModal")
        .classList.add("open");

}


function closeClassModal(){

    document
        .getElementById("classModal")
        .classList.remove("open");

}


async function createClass(){

    const user =
        getCurrentStudyUser();

    if(
        !user ||
        user.role !== "teacher"
    ){

        toast(
            "Debes entrar como profesor."
        );

        return;

    }

    const name =
        document
            .getElementById("className")
            .value
            .trim();

    const code =
        document
            .getElementById("classCode")
            .value
            .trim()
            .toUpperCase();

    if(!name){

        toast(
            "Escribe el nombre de la clase."
        );

        return;

    }

    try{

        const result =
            await classApiRequest(
                "",
                {
                    method:"POST",
                    body:{
                        name,
                        code,
                        ownerToken:user.classOwnerToken || ""
                    }
                }
            );

        user.classOwnerToken =
            result.ownerToken;

        persistStudyUser();

        document.getElementById(
            "className"
        ).value = "";

        document.getElementById(
            "classCode"
        ).value = "";

        closeClassModal();

        await renderClasses();

        toast(
            `Clase creada. Comparte el código ${result.code}.`
        );

    }catch(error){

        console.error("No se pudo crear la clase:", error);

        toast(
            error.message
        );

    }

}


async function renderClasses(){

    const teacherBox =
        document.getElementById(
            "teacherClasses"
        );

    const studentBox =
        document.getElementById(
            "studentClasses"
        );

    if(!teacherBox || !studentBox){
        return;
    }

    const user =
        getCurrentStudyUser();

    if(!user){

        teacherBox.innerHTML = "";
        studentBox.innerHTML = "";

        return;

    }

    const currentEmail = user.email;

    teacherBox.innerHTML = "";
    studentBox.innerHTML = "";

    try{

        if(user.role === "teacher"){

            const migrationErrors =
                await publishLegacyTeacherClasses(user);

            const result =
                user.classOwnerToken
                    ? await classApiRequest(
                        `/teacher/${encodeURIComponent(user.classOwnerToken)}`
                    )
                    : {classes:[]};

            if(getCurrentStudyUser()?.email !== currentEmail){
                return;
            }

            const classList =
                result.classes.length
                    ? result.classes.map(
                        item => `
                            <div class="class-item">
                                <div>
                                    <strong>${escapeHTML(item.name)}</strong>
                                    <span>
                                        Código:
                                        <b>${escapeHTML(item.code)}</b>
                                        · ${item.studentCount} estudiante(s)
                                    </span>
                                </div>
                                <button
                                    class="secondary"
                                    onclick="deleteClass('${escapeHTML(item.id)}')">
                                    Eliminar
                                </button>
                            </div>
                        `
                    ).join("")
                    : `<div class="empty">Todavía no has creado ninguna clase.</div>`;

            const migrationMessage =
                migrationErrors.length
                    ? `<div class="empty">No se pudieron compartir algunas clases anteriores: ${migrationErrors.map(escapeHTML).join("; ")}. Si el código ya existe, crea una clase con otro código para compartirla.</div>`
                    : "";

            teacherBox.innerHTML =
                migrationMessage + classList;

        }

        if(user.role === "student"){

            const result =
                user.classStudentToken
                    ? await classApiRequest(
                        `/student/${encodeURIComponent(user.classStudentToken)}`
                    )
                    : {classes:[]};

            if(getCurrentStudyUser()?.email !== currentEmail){
                return;
            }

            studentBox.innerHTML =
                result.classes.length
                    ? result.classes.map(
                        item => `
                            <div class="class-item">
                                <div>
                                    <strong>${escapeHTML(item.name)}</strong>
                                    <span>Código: ${escapeHTML(item.code)}</span>
                                </div>
                                <button
                                    class="secondary"
                                    onclick="leaveClass('${escapeHTML(item.id)}')">
                                    Salir
                                </button>
                            </div>
                        `
                    ).join("")
                    : `<div class="empty">Todavía no estás unido a ninguna clase.</div>`;

        }

    }catch(error){

        console.error("No se pudieron cargar las clases:", error);

        const message =
            `<div class="empty">No se pudieron cargar las clases: ${escapeHTML(error.message)}. Comprueba que el backend esté iniciado y configurado.</div>`;

        if(user.role === "teacher"){
            teacherBox.innerHTML = message;
        }

        if(user.role === "student"){
            studentBox.innerHTML = message;
        }

    }

}


async function joinClass(){

    const user =
        getCurrentStudyUser();

    if(
        !user ||
        user.role !== "student"
    ){

        toast(
            "Debes entrar como estudiante."
        );

        return;

    }

    const code =
        prompt(
            "Escribe el código de la clase:"
        );

    if(code === null){
        return;
    }

    try{

        const studentToken =
            ensureStudentToken(user);

        const result =
            await classApiRequest(
                "/join",
                {
                    method:"POST",
                    body:{
                        code:code.trim().toUpperCase(),
                        studentToken
                    }
                }
            );

        await renderClasses();

        toast(
            `Te has unido a ${result.class.name}.`
        );

    }catch(error){

        console.error("No se pudo unir a la clase:", error);

        toast(
            error.message
        );

    }

}


async function leaveClass(id){

    const user =
        getCurrentStudyUser();

    if(!user || !user.classStudentToken){
        return;
    }

    try{

        await classApiRequest(
            `/${encodeURIComponent(id)}/leave`,
            {
                method:"POST",
                body:{
                    studentToken:user.classStudentToken
                }
            }
        );

        await renderClasses();

        toast(
            "Has salido de la clase."
        );

    }catch(error){

        console.error("No se pudo salir de la clase:", error);

        toast(
            error.message
        );

    }

}


async function deleteClass(id){

    const user =
        getCurrentStudyUser();

    if(!user || !user.classOwnerToken){
        return;
    }

    if(
        !confirm(
            "¿Seguro que quieres eliminar esta clase para todos sus estudiantes?"
        )
    ){
        return;
    }

    try{

        await classApiRequest(
            `/${encodeURIComponent(id)}`,
            {
                method:"DELETE",
                headers:{
                    "X-Class-Owner-Token":user.classOwnerToken
                }
            }
        );

        await renderClasses();

        toast(
            "Clase eliminada."
        );

    }catch(error){

        console.error("No se pudo eliminar la clase:", error);

        toast(
            error.message
        );

    }

}


/* =========================
   SEGURIDAD BÁSICA
========================= */

function escapeHTML(text){

    const element =
        document.createElement("div");

    element.textContent =
        String(text ?? "");

    return element.innerHTML;

}


/* =========================
   ACTUALIZAR TODO
========================= */

function renderAll(){

    renderTasks();

    updateStats();

    renderChart();

}


/* =========================
   MENSAJES
========================= */

function toast(message){

    const element =
        document.getElementById(
            "toast"
        );

    element.textContent =
        message;

    element.classList.add(
        "show"
    );

    clearTimeout(
        window.__toastTimer
    );

    window.__toastTimer =
        setTimeout(
            () => {

                element.classList.remove(
                    "show"
                );

            },
            2200
        );

}
