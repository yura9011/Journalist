"use strict";

const obsidian = require("obsidian");

const DEFAULT_SETTINGS = {
  apiKey: "",
  apiProvider: "gemini",
  defaultStyle: "structured",
  autoSuggestTags: true,
  journalFolder: "journal/daily",
  customPrompt: ""
};

const STYLES = {
  structured: {
    name: "Estructurado",
    description: "Organiza el contenido en secciones claras",
    prompt: `Transforma el siguiente texto en una entrada de diario estructurada en español.
Incluye:
- Un título significativo basado en el contenido
- Secciones organizadas (Resumen del día, Logros, Reflexiones, Pendientes si aplica)
- Tags sugeridos al final (formato: #tag1 #tag2)
- Mantén el tono personal pero organizado
- Usa formato Markdown

Texto a transformar:`
  },
  reflective: {
    name: "Reflexivo",
    description: "Enfocado en emociones y aprendizajes",
    prompt: `Transforma el siguiente texto en una entrada de diario reflexiva en español.
Incluye:
- Un título que capture la esencia emocional
- Sección de "Cómo me sentí"
- Sección de "Qué aprendí"
- Sección de "Gratitud" (extrae cosas positivas mencionadas)
- Tags emocionales sugeridos
- Usa formato Markdown

Texto a transformar:`
  },
  bullet: {
    name: "Bullet Journal",
    description: "Formato conciso con viñetas",
    prompt: `Transforma el siguiente texto en formato bullet journal en español.
Incluye:
- Título breve
- Bullets organizados por categoría (tareas •, eventos ○, notas -)
- Prioridades marcadas con *
- Tags relevantes al final
- Mantén todo muy conciso
- Usa formato Markdown

Texto a transformar:`
  },
  narrative: {
    name: "Narrativo",
    description: "Estilo de historia personal",
    prompt: `Transforma el siguiente texto en una narrativa personal fluida en español.
Incluye:
- Un título evocador
- Redacción en primera persona
- Párrafos bien estructurados
- Transiciones suaves entre ideas
- Tags temáticos al final
- Usa formato Markdown

Texto a transformar:`
  }
};

class JournalTransformerPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();

    // Comando principal
    this.addCommand({
      id: "transform-journal",
      name: "Transformar texto en entrada de diario",
      callback: () => this.openTransformModal()
    });

    // Comando para texto seleccionado
    this.addCommand({
      id: "transform-selection",
      name: "Transformar selección en entrada de diario",
      editorCallback: (editor) => this.transformSelection(editor)
    });

    // Settings tab
    this.addSettingTab(new JournalTransformerSettingTab(this.app, this));

    console.log("Journal Transformer loaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  openTransformModal() {
    new TransformModal(this.app, this).open();
  }

  async transformSelection(editor) {
    const selection = editor.getSelection();
    if (!selection) {
      new obsidian.Notice("Selecciona texto primero");
      return;
    }
    new TransformModal(this.app, this, selection).open();
  }

  async callLLM(text, style) {
    const styleConfig = STYLES[style];
    const prompt = (this.settings.customPrompt || styleConfig.prompt) + "\n\n" + text;

    if (this.settings.apiProvider === "gemini") {
      return await this.callGemini(prompt);
    }
    
    throw new Error("Proveedor de API no soportado");
  }

  async callGemini(prompt) {
    if (!this.settings.apiKey) {
      throw new Error("Configura tu API key de Gemini en los ajustes del plugin");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${this.settings.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Error de Gemini: ${error}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar contenido";
  }

  async generateQuestions(journalContent) {
    const prompt = `Basándote en esta entrada de diario, genera exactamente 3 preguntas reflexivas en español que ayuden al usuario a profundizar en su día.

Las preguntas deben:
- Ser específicas al contenido mencionado (no genéricas)
- Invitar a la reflexión profunda
- Ayudar a descubrir emociones o aprendizajes no mencionados
- Ser abiertas (no de sí/no)

Formato de respuesta (solo las preguntas, una por línea):
1. [pregunta]
2. [pregunta]
3. [pregunta]

Entrada de diario:
${journalContent}`;

    return await this.callGemini(prompt);
  }

  async enrichWithAnswers(originalContent, questions, answers) {
    const prompt = `Toma esta entrada de diario y enriquécela con las respuestas adicionales del usuario.

Entrada original:
${originalContent}

Preguntas y respuestas adicionales:
${questions.map((q, i) => `P: ${q}\nR: ${answers[i] || "(sin respuesta)"}`).join("\n\n")}

Genera una versión mejorada de la entrada que:
- Integre naturalmente las nuevas reflexiones
- Mantenga el formato y estilo original
- Agregue una sección "Reflexiones adicionales" si es necesario
- No repita información
- Use formato Markdown`;

    return await this.callGemini(prompt);
  }
}


class TransformModal extends obsidian.Modal {
  constructor(app, plugin, initialText = "") {
    super(app);
    this.plugin = plugin;
    this.initialText = initialText;
    this.result = "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("journal-transformer-modal");

    contentEl.createEl("h2", { text: "✨ Journal Transformer" });

    // Input section
    const inputSection = contentEl.createDiv({ cls: "input-section" });
    inputSection.createEl("label", { text: "Texto a transformar:" });
    
    this.inputArea = inputSection.createEl("textarea", {
      placeholder: "Escribe o pega tu texto aquí... Puede ser desordenado, con ideas sueltas, lo que quieras."
    });
    this.inputArea.value = this.initialText;

    // Style selector
    const styleSection = contentEl.createDiv({ cls: "style-selector" });
    styleSection.createEl("label", { text: "Estilo de salida:" });
    
    this.styleSelect = styleSection.createEl("select");
    Object.entries(STYLES).forEach(([key, style]) => {
      const option = this.styleSelect.createEl("option", {
        value: key,
        text: `${style.name} - ${style.description}`
      });
      if (key === this.plugin.settings.defaultStyle) {
        option.selected = true;
      }
    });

    // Transform button
    const transformBtn = contentEl.createEl("button", {
      text: "🔄 Transformar",
      cls: "mod-cta"
    });
    transformBtn.onclick = () => this.transform();

    // Output section (hidden initially)
    this.outputSection = contentEl.createDiv({ cls: "output-section" });
    this.outputSection.style.display = "none";

    // Processing indicator
    this.processingDiv = contentEl.createDiv({ cls: "processing" });
    this.processingDiv.style.display = "none";
    this.processingDiv.createDiv({ cls: "spinner" });
    this.processingDiv.createSpan({ text: "Procesando con IA..." });
  }

  async transform() {
    const text = this.inputArea.value.trim();
    if (!text) {
      new obsidian.Notice("Ingresa texto para transformar");
      return;
    }

    this.processingDiv.style.display = "flex";
    this.outputSection.style.display = "none";

    try {
      this.result = await this.plugin.callLLM(text, this.styleSelect.value);
      this.showResult();
    } catch (error) {
      new obsidian.Notice(`Error: ${error.message}`);
      console.error(error);
    } finally {
      this.processingDiv.style.display = "none";
    }
  }

  showResult() {
    this.outputSection.empty();
    this.outputSection.style.display = "block";

    this.outputSection.createEl("h4", { text: "📝 Paso 1 - Resultado:" });
    
    this.resultArea = this.outputSection.createEl("textarea");
    this.resultArea.value = this.result;
    this.resultArea.style.minHeight = "200px";

    const buttonRow = this.outputSection.createDiv({ cls: "button-row" });

    // Deepen button (Paso 2)
    const deepenBtn = buttonRow.createEl("button", {
      text: "🔍 Profundizar (Paso 2)",
      cls: "mod-cta"
    });
    deepenBtn.onclick = () => this.showQuestions();

    // Skip to save
    const skipBtn = buttonRow.createEl("button", { text: "⏭️ Saltar y guardar" });
    skipBtn.onclick = () => this.showFinalOptions();
  }

  async showQuestions() {
    this.processingDiv.style.display = "flex";
    this.processingDiv.querySelector("span").textContent = "Generando preguntas reflexivas...";

    try {
      const questionsRaw = await this.plugin.generateQuestions(this.result);
      this.questions = questionsRaw
        .split("\n")
        .filter(line => line.match(/^\d\./))
        .map(line => line.replace(/^\d\.\s*/, "").trim());

      if (this.questions.length === 0) {
        this.questions = ["¿Qué más te gustaría recordar de hoy?", "¿Cómo te sentiste realmente?", "¿Qué aprendiste?"];
      }

      this.showQuestionsUI();
    } catch (error) {
      new obsidian.Notice(`Error: ${error.message}`);
    } finally {
      this.processingDiv.style.display = "none";
    }
  }

  showQuestionsUI() {
    this.outputSection.empty();
    
    this.outputSection.createEl("h4", { text: "🤔 Paso 2 - Preguntas para profundizar:" });
    this.outputSection.createEl("p", { 
      text: "Responde las que quieras para enriquecer tu entrada:",
      cls: "setting-item-description"
    });

    this.answerInputs = [];

    this.questions.forEach((question, index) => {
      const questionDiv = this.outputSection.createDiv({ cls: "question-item" });
      questionDiv.style.marginBottom = "15px";
      
      questionDiv.createEl("label", { 
        text: `${index + 1}. ${question}`,
        attr: { style: "display: block; margin-bottom: 5px; font-weight: 500;" }
      });
      
      const answerInput = questionDiv.createEl("textarea", {
        placeholder: "Tu respuesta (opcional)...",
        attr: { style: "width: 100%; min-height: 60px; padding: 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary);" }
      });
      
      this.answerInputs.push(answerInput);
    });

    const buttonRow = this.outputSection.createDiv({ cls: "button-row" });

    // Enrich button
    const enrichBtn = buttonRow.createEl("button", {
      text: "✨ Enriquecer entrada",
      cls: "mod-cta"
    });
    enrichBtn.onclick = () => this.enrichEntry();

    // Skip button
    const skipBtn = buttonRow.createEl("button", { text: "⏭️ Saltar" });
    skipBtn.onclick = () => this.showFinalOptions();
  }

  async enrichEntry() {
    const answers = this.answerInputs.map(input => input.value.trim());
    
    if (answers.every(a => !a)) {
      this.showFinalOptions();
      return;
    }

    this.processingDiv.style.display = "flex";
    this.processingDiv.querySelector("span").textContent = "Enriqueciendo entrada...";

    try {
      this.result = await this.plugin.enrichWithAnswers(this.result, this.questions, answers);
      this.showFinalOptions();
    } catch (error) {
      new obsidian.Notice(`Error: ${error.message}`);
    } finally {
      this.processingDiv.style.display = "none";
    }
  }

  showFinalOptions() {
    this.outputSection.empty();
    
    this.outputSection.createEl("h4", { text: "✅ Entrada final:" });
    
    const resultArea = this.outputSection.createEl("textarea");
    resultArea.value = this.result;
    resultArea.style.minHeight = "250px";

    const buttonRow = this.outputSection.createDiv({ cls: "button-row" });

    // Copy button
    const copyBtn = buttonRow.createEl("button", { text: "📋 Copiar" });
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(resultArea.value);
      new obsidian.Notice("Copiado al portapapeles");
    };

    // Insert button
    const insertBtn = buttonRow.createEl("button", { text: "📥 Insertar en nota actual" });
    insertBtn.onclick = () => {
      const editor = this.app.workspace.activeEditor?.editor;
      if (editor) {
        editor.replaceSelection(resultArea.value);
        this.close();
        new obsidian.Notice("Insertado en la nota");
      } else {
        new obsidian.Notice("No hay nota activa");
      }
    };

    // Create new note button
    const newNoteBtn = buttonRow.createEl("button", {
      text: "📄 Crear nueva nota",
      cls: "mod-cta"
    });
    newNoteBtn.onclick = () => this.createNewNote(resultArea.value);
  }

  async createNewNote(content) {
    const today = new Date().toISOString().slice(0, 10);
    const folder = this.plugin.settings.journalFolder;
    const filename = `${folder}/${today}.md`;

    try {
      let file = this.app.vault.getAbstractFileByPath(filename);
      
      if (file instanceof obsidian.TFile) {
        // Append to existing
        const existing = await this.app.vault.read(file);
        await this.app.vault.modify(file, existing + "\n\n---\n\n" + content);
        new obsidian.Notice("Agregado a la nota del día");
      } else {
        // Create new
        file = await this.app.vault.create(filename, content);
        new obsidian.Notice("Nota creada");
      }

      await this.app.workspace.getLeaf().openFile(file);
      this.close();
    } catch (error) {
      new obsidian.Notice(`Error: ${error.message}`);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class JournalTransformerSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Journal Transformer - Configuración" });

    // API Provider
    new obsidian.Setting(containerEl)
      .setName("Proveedor de IA")
      .setDesc("Selecciona el modelo de lenguaje a usar")
      .addDropdown(dropdown => dropdown
        .addOption("gemini", "Google Gemini")
        .setValue(this.plugin.settings.apiProvider)
        .onChange(async (value) => {
          this.plugin.settings.apiProvider = value;
          await this.plugin.saveSettings();
        }));

    // API Key
    new obsidian.Setting(containerEl)
      .setName("API Key")
      .setDesc("Tu clave de API de Gemini (obtener en ai.google.dev)")
      .addText(text => text
        .setPlaceholder("AIza...")
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        }));

    // Default style
    new obsidian.Setting(containerEl)
      .setName("Estilo por defecto")
      .setDesc("Estilo de transformación predeterminado")
      .addDropdown(dropdown => {
        Object.entries(STYLES).forEach(([key, style]) => {
          dropdown.addOption(key, style.name);
        });
        dropdown.setValue(this.plugin.settings.defaultStyle);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultStyle = value;
          await this.plugin.saveSettings();
        });
      });

    // Journal folder
    new obsidian.Setting(containerEl)
      .setName("Carpeta del diario")
      .setDesc("Dónde guardar las entradas de diario")
      .addText(text => text
        .setValue(this.plugin.settings.journalFolder)
        .onChange(async (value) => {
          this.plugin.settings.journalFolder = value;
          await this.plugin.saveSettings();
        }));

    // Custom prompt
    new obsidian.Setting(containerEl)
      .setName("Prompt personalizado")
      .setDesc("Opcional: reemplaza el prompt por defecto (deja vacío para usar los predefinidos)")
      .addTextArea(text => text
        .setPlaceholder("Tu prompt personalizado...")
        .setValue(this.plugin.settings.customPrompt)
        .onChange(async (value) => {
          this.plugin.settings.customPrompt = value;
          await this.plugin.saveSettings();
        }));
  }
}

module.exports = JournalTransformerPlugin;
