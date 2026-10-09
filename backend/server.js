const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID } = require("node:crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLASSES_FILE =
    process.env.STUDY_CLASSES_FILE ||
    path.join(__dirname, "data", "classes.json");

if(Boolean(SUPABASE_URL) !== Boolean(SUPABASE_SERVICE_ROLE_KEY)){
    throw new Error(
        "Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY juntas, o deja ambas sin configurar."
    );
}

app.use(cors());
app.use(express.json());


// ==============================
// ALMACENAMIENTO COMPARTIDO DE CLASES
// ==============================

function readLocalClasses(){

    if(!fs.existsSync(CLASSES_FILE)){
        return [];
    }

    const content =
        fs.readFileSync(CLASSES_FILE, "utf8");

    const classes =
        JSON.parse(content);

    if(!Array.isArray(classes)){
        throw new Error("El archivo local de clases no contiene una lista válida.");
    }

    return classes;

}


function writeLocalClasses(classes){

    fs.mkdirSync(path.dirname(CLASSES_FILE), {recursive:true});

    const temporaryFile =
        `${CLASSES_FILE}.${process.pid}.tmp`;

    fs.writeFileSync(
        temporaryFile,
        JSON.stringify(classes, null, 2),
        "utf8"
    );

    fs.renameSync(temporaryFile, CLASSES_FILE);

}


async function supabaseRequest(endpoint, options = {}){

    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${endpoint}`,
        {
            method:options.method || "GET",
            headers:{
                apikey:SUPABASE_SERVICE_ROLE_KEY,
                Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type":"application/json",
                Prefer:options.prefer || "return=representation"
            },
            body:options.body
                ? JSON.stringify(options.body)
                : undefined
        }
    );

    const responseText =
        await response.text();

    if(!response.ok){
        throw new Error(
            `Supabase respondió ${response.status}: ${responseText}`
        );
    }

    return responseText
        ? JSON.parse(responseText)
        : [];

}


async function findClassByCode(code){

    if(SUPABASE_URL){

        const query =
            new URLSearchParams({
                select:"id,name,code,owner_token,student_tokens",
                code:`eq.${code}`
            });

        const rows =
            await supabaseRequest(
                `study_classes?${query.toString()}`
            );

        return rows[0] || null;

    }

    return readLocalClasses().find(
        item => item.code === code
    ) || null;

}


async function findClassById(id){

    if(SUPABASE_URL){

        const query =
            new URLSearchParams({
                select:"id,name,code,owner_token,student_tokens",
                id:`eq.${id}`
            });

        const rows =
            await supabaseRequest(
                `study_classes?${query.toString()}`
            );

        return rows[0] || null;

    }

    return readLocalClasses().find(
        item => item.id === id
    ) || null;

}


async function saveClass(classItem){

    if(SUPABASE_URL){

        const rows =
            await supabaseRequest(
                "study_classes",
                {
                    method:"POST",
                    body:classItem
                }
            );

        return rows[0];

    }

    const classes =
        readLocalClasses();

    classes.push(classItem);
    writeLocalClasses(classes);

    return classItem;

}


async function updateClass(classItem){

    if(SUPABASE_URL){

        const query =
            new URLSearchParams({
                id:`eq.${classItem.id}`
            });

        const rows =
            await supabaseRequest(
                `study_classes?${query.toString()}`,
                {
                    method:"PATCH",
                    body:{
                        student_tokens:classItem.student_tokens
                    }
                }
            );

        return rows[0] || null;

    }

    const classes =
        readLocalClasses();

    const index =
        classes.findIndex(
            item => item.id === classItem.id
        );

    if(index < 0){
        return null;
    }

    classes[index] = classItem;
    writeLocalClasses(classes);

    return classItem;

}


function publicClass(classItem){

    return {
        id:classItem.id,
        name:classItem.name,
        code:classItem.code,
        studentCount:classItem.student_tokens.length
    };

}


function isValidToken(value){

    return (
        typeof value === "string" &&
        /^[a-f0-9-]{36}$/i.test(value)
    );

}


app.get("/api/classes/teacher/:ownerToken", async (req, res) => {

    try{

        const { ownerToken } = req.params;

        if(!isValidToken(ownerToken)){
            return res.status(400).json({error:"Identificador de profesor inválido."});
        }

        let classes;

        if(SUPABASE_URL){

            const query =
                new URLSearchParams({
                    select:"id,name,code,owner_token,student_tokens",
                    owner_token:`eq.${ownerToken}`,
                    order:"created_at.asc"
                });

            classes =
                await supabaseRequest(
                    `study_classes?${query.toString()}`
                );

        }else{

            classes =
                readLocalClasses().filter(
                    item => item.owner_token === ownerToken
                );

        }

        res.json({
            classes:classes.map(publicClass)
        });

    }catch(error){

        console.error("Error al cargar clases del profesor:", error);
        res.status(500).json({error:"No se pudieron cargar las clases."});

    }

});


app.get("/api/classes/student/:studentToken", async (req, res) => {

    try{

        const { studentToken } = req.params;

        if(!isValidToken(studentToken)){
            return res.status(400).json({error:"Identificador de estudiante inválido."});
        }

        let classes;

        if(SUPABASE_URL){

            const query =
                new URLSearchParams({
                    select:"id,name,code,owner_token,student_tokens",
                    student_tokens:`cs.{${studentToken}}`,
                    order:"created_at.asc"
                });

            classes =
                await supabaseRequest(
                    `study_classes?${query.toString()}`
                );

        }else{

            classes =
                readLocalClasses().filter(
                    item => item.student_tokens.includes(studentToken)
                );

        }

        res.json({
            classes:classes.map(publicClass)
        });

    }catch(error){

        console.error("Error al cargar clases del estudiante:", error);
        res.status(500).json({error:"No se pudieron cargar las clases."});

    }

});


app.post("/api/classes", async (req, res) => {

    try{

        const name =
            typeof req.body.name === "string"
                ? req.body.name.trim()
                : "";

        const requestedCode =
            typeof req.body.code === "string"
                ? req.body.code.trim().toUpperCase()
                : "";
        const requestedOwnerToken =
            req.body.ownerToken || "";

        if(!name || name.length > 100){
            return res.status(400).json({error:"El nombre debe tener entre 1 y 100 caracteres."});
        }

        if(
            requestedCode &&
            !/^[A-Z0-9-]{3,20}$/.test(requestedCode)
        ){
            return res.status(400).json({error:"El código debe tener entre 3 y 20 caracteres (letras, números o guiones)."});
        }

        if(
            requestedOwnerToken &&
            !isValidToken(requestedOwnerToken)
        ){
            return res.status(400).json({error:"Identificador de profesor inválido."});
        }

        const code =
            requestedCode ||
            randomBytes(4).toString("hex").slice(0, 6).toUpperCase();

        const existingClass =
            await findClassByCode(code);

        if(existingClass){

            if(
                requestedOwnerToken &&
                existingClass.owner_token === requestedOwnerToken &&
                existingClass.name === name
            ){
                return res.json({
                    ...publicClass(existingClass),
                    ownerToken:existingClass.owner_token
                });
            }

            return res.status(409).json({error:"Ese código ya está en uso. Prueba con otro."});

        }

        const classItem = {
            id:randomUUID(),
            name,
            code,
            owner_token:requestedOwnerToken || randomUUID(),
            student_tokens:[],
            created_at:new Date().toISOString()
        };

        const savedClass =
            await saveClass(classItem);

        res.status(201).json({
            ...publicClass(savedClass),
            ownerToken:savedClass.owner_token
        });

    }catch(error){

        console.error("Error al crear clase:", error);
        res.status(500).json({error:"No se pudo crear la clase."});

    }

});


app.post("/api/classes/join", async (req, res) => {

    try{

        const code =
            typeof req.body.code === "string"
                ? req.body.code.trim().toUpperCase()
                : "";

        const studentToken =
            req.body.studentToken;

        if(
            !/^[A-Z0-9-]{3,20}$/.test(code) ||
            !isValidToken(studentToken)
        ){
            return res.status(400).json({error:"Código o identificador de estudiante inválido."});
        }

        const classItem =
            await findClassByCode(code);

        if(!classItem){
            return res.status(404).json({error:"No se encontró una clase con ese código."});
        }

        if(!classItem.student_tokens.includes(studentToken)){

            classItem.student_tokens.push(studentToken);

            const updatedClass =
                await updateClass(classItem);

            if(!updatedClass){
                return res.status(409).json({error:"La clase cambió mientras intentabas unirte. Vuelve a intentarlo."});
            }

        }

        res.json({
            class:publicClass(classItem)
        });

    }catch(error){

        console.error("Error al unirse a clase:", error);
        res.status(500).json({error:"No se pudo completar la unión a la clase."});

    }

});


app.post("/api/classes/:id/leave", async (req, res) => {

    try{

        const { id } = req.params;
        const studentToken = req.body.studentToken;

        if(!isValidToken(studentToken)){
            return res.status(400).json({error:"Identificador de estudiante inválido."});
        }

        const classItem =
            await findClassById(id);

        if(!classItem){
            return res.status(404).json({error:"No se encontró la clase."});
        }

        if(!classItem.student_tokens.includes(studentToken)){
            return res.status(403).json({error:"No perteneces a esta clase."});
        }

        classItem.student_tokens =
            classItem.student_tokens.filter(
                token => token !== studentToken
            );

        await updateClass(classItem);

        res.json({success:true});

    }catch(error){

        console.error("Error al salir de clase:", error);
        res.status(500).json({error:"No se pudo salir de la clase."});

    }

});


app.delete("/api/classes/:id", async (req, res) => {

    try{

        const { id } = req.params;
        const ownerToken =
            req.get("X-Class-Owner-Token");

        if(!isValidToken(ownerToken)){
            return res.status(400).json({error:"Identificador de profesor inválido."});
        }

        const classItem =
            await findClassById(id);

        if(!classItem){
            return res.status(404).json({error:"No se encontró la clase."});
        }

        if(classItem.owner_token !== ownerToken){
            return res.status(403).json({error:"No tienes permiso para eliminar esta clase."});
        }

        if(SUPABASE_URL){

            const query =
                new URLSearchParams({
                    id:`eq.${id}`,
                    owner_token:`eq.${ownerToken}`
                });

            await supabaseRequest(
                `study_classes?${query.toString()}`,
                {
                    method:"DELETE",
                    prefer:"return=minimal"
                }
            );

        }else{

            writeLocalClasses(
                readLocalClasses().filter(
                    item => item.id !== id
                )
            );

        }

        res.json({success:true});

    }catch(error){

        console.error("Error al eliminar clase:", error);
        res.status(500).json({error:"No se pudo eliminar la clase."});

    }

});

// ==============================
// CONEXIÓN CON OPENAI
// ==============================

let client = null;


// ==============================
// ASISTENTE IA DE STUDY HUB
// ==============================

app.post("/api/ia", async (req, res) => {

    try {

        if(!process.env.OPENAI_API_KEY){
            return res.status(503).json({
                error: "El asistente IA no está configurado en este servidor."
            });
        }

        if(!client){
            client = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }

        const pregunta = req.body.pregunta;

        if (!pregunta || pregunta.trim() === "") {

            return res.status(400).json({
                error: "Escribe una pregunta."
            });

        }

        const respuesta = await client.responses.create({

            model: "gpt-5.5",

            instructions: `
                Eres el asistente educativo de Study Hub.

                Ayudas a estudiantes de secundaria
                intermedia y alta.

                Tu objetivo es enseñar y explicar,
                no solamente entregar respuestas.

                Explica de forma:
                - Clara
                - Sencilla
                - Ordenada
                - Apropiada para estudiantes

                Puedes ayudar con:
                - Matemáticas
                - Ciencia
                - Historia
                - Comunicación
                - Inglés
                - Organización de tareas
                - Técnicas de estudio
                - Preparación para exámenes

                Cuando sea necesario, explica
                los procedimientos paso a paso.

                Responde en español, excepto si
                el estudiante pide otro idioma.
            `,

            input: pregunta

        });

        res.json({
            respuesta: respuesta.output_text
        });

    } catch (error) {

        console.error("Error:", error);

        res.status(500).json({
            error: "Hubo un problema al conectar con la IA."
        });

    }

});


// ==============================
// PRUEBA DEL SERVIDOR
// ==============================

app.get("/", (req, res) => {

    res.send("Study Hub - Backend funcionando correctamente.");

});


// ==============================
// INICIAR SERVIDOR
// ==============================

app.listen(PORT, () => {

    console.log(
        `Study Hub funcionando en http://localhost:${PORT}`
    );

});