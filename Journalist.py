import sys
import datetime
import json
import random
from PySide6.QtWidgets import (
    QApplication,
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QTextEdit,
    QLineEdit,
    QPushButton,
    QListWidget,
    QListWidgetItem,
    QLabel,
    QMessageBox,
    QFileDialog,
    QDateEdit,
    QInputDialog
)
from PySide6.QtCore import QDate, Qt, QSize
from cryptography.fernet import Fernet

class JournalApp(QMainWindow):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Mi Diario")
        self.setMinimumSize(500, 600)

        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)

        self.layout = QVBoxLayout()
        self.central_widget.setLayout(self.layout)

        self.journalEntries = []

        self.create_widgets()
        self.loadEntries()

    def create_widgets(self):
        # QTextEdit para la entrada actual
        self.currentEntry = QTextEdit()
        self.currentEntry.setMinimumHeight(150)  # Ajustar altura mínima
        self.layout.addWidget(self.currentEntry)

        # QDateEdit para la fecha actual
        self.dateEdit = QDateEdit(QDate.currentDate())
        self.dateEdit.setCalendarPopup(True)
        self.dateEdit.setDisplayFormat("yyyy-MM-dd")
        self.layout.addWidget(self.dateEdit)

        # Layout horizontal para los botones
        buttonsLayout = QHBoxLayout()
        

        # QPushButton para guardar la entrada
        self.saveButton = QPushButton("Guardar Entrada")
        self.saveButton.setMinimumSize(QSize(150, 40))
        self.saveButton.clicked.connect(self.writeEntry)
        buttonsLayout.addWidget(self.saveButton)

        # QPushButton para cargar entradas
        self.loadButton = QPushButton("Cargar Entradas")
        self.loadButton.setMinimumSize(QSize(150, 40))
        self.loadButton.clicked.connect(self.readEntries)
        buttonsLayout.addWidget(self.loadButton)
        
        buttonsLayout.addStretch()

        self.layout.addLayout(buttonsLayout)  # Agregar el layout horizontal al layout principal

        # QListWidget para mostrar las entradas anteriores
        self.entriesList = QListWidget()
        self.entriesList.setMinimumHeight(200)
        self.layout.addWidget(self.entriesList)
        
        searchLayout = QHBoxLayout()
        
        # QLineEdit para la búsqueda por contenido
        self.searchLineEdit = QLineEdit()
        self.searchLineEdit.setPlaceholderText("Buscar por contenido...")
        searchLayout.addWidget(self.searchLineEdit)

        # QPushButton para realizar la búsqueda
        self.searchButton = QPushButton("Buscar")
        self.searchButton.clicked.connect(self.searchEntries)
        searchLayout.addWidget(self.searchButton)
        
        searchLayout.addStretch()

        self.layout.addLayout(searchLayout)  # Agregar el layout horizontal al layout principal

        # QLabel para mostrar mensajes
        self.messageLabel = QLabel("")
        self.messageLabel.setStyleSheet("color: red; font-size: 14px;")  # Estilo para mensajes
        self.layout.addWidget(self.messageLabel)

        # Añadir espaciadores para centrar los widgets
        self.layout.insertSpacing(0, 10)  # Espacio antes del primer widget
        self.layout.addSpacing(10)  # Espacio después del último widget

        # Establecer márgenes
        self.layout.setContentsMargins(10, 10, 10, 10)

    def generate_key(self):
        """Generates a new Fernet key and saves it to a file."""
        key = Fernet.generate_key()
        with open("journal_key.key", "wb") as key_file:
            key_file.write(key)

    def load_key(self):
        """Loads the Fernet key from a file."""
        return open("journal_key.key", "rb").read()

    def writeEntry(self):
        """Escribe una nueva entrada en el diario."""
        now = datetime.datetime.now()
        current_date_time = now.strftime("%Y-%m-%d %H:%M:%S")
        entry_text = self.currentEntry.toPlainText()

        if not entry_text.strip():
            QMessageBox.warning(self, "Entrada Vacía", "Por favor, escribe algo en la entrada.")
            return

        # Obtener la fecha seleccionada del QDateEdit
        entry_date = self.dateEdit.date().toString("yyyy-MM-dd")

        # Aquí, la hora se obtiene del datetime actual.
        # Podrías considerar agregar un QTimeEdit si quieres que el usuario seleccione la hora también.
        entry_time = now.strftime("%H:%M:%S")

        tags_text, ok = QInputDialog.getText(self, "Etiquetas", "Introduce las etiquetas separadas por comas (opcional):")
        if ok:
            tags_list = [tag.strip() for tag in tags_text.split(',')] if tags_text else []
        else:
            tags_list = []

        # Encriptar la entrada
        key = self.load_key()
        f = Fernet(key)
        encrypted_entry = f.encrypt(entry_text.encode())

        self.journalEntries.append({'date': entry_date, 'time': entry_time, 'entry': encrypted_entry.decode(), 'tags': tags_list})
        self.currentEntry.clear()
        self.messageLabel.setText("Entrada guardada correctamente.")
        self.updateEntriesList()

    def readEntries(self):
        """Lee las entradas del diario."""
        self.entriesList.clear()
        key = self.load_key()
        f = Fernet(key)
        for entry in self.journalEntries:
            try:
                decrypted_entry = f.decrypt(entry['entry'].encode()).decode()
                entry_str = f"{entry['date']} {entry['time']}: {decrypted_entry}"
                if 'tags' in entry and entry['tags']:
                    entry_str += f" (Tags: {', '.join(entry['tags'])})"
                self.entriesList.addItem(entry_str)
            except Exception as e:
                print(f"Error al desencriptar: {e}")
                self.entriesList.addItem(f"Error al desencriptar entrada del {entry['date']} {entry['time']}")

    def searchEntries(self):
        """Busca entradas en el diario por contenido."""
        search_term = self.searchLineEdit.text()
        if not search_term:
            QMessageBox.warning(self, "Búsqueda Vacía", "Por favor, introduce un término de búsqueda.")
            return

        self.entriesList.clear()
        key = self.load_key()
        f = Fernet(key)
        for entry in self.journalEntries:
            try:
                decrypted_entry = f.decrypt(entry['entry'].encode()).decode()
                if search_term.lower() in decrypted_entry.lower():
                    entry_str = f"{entry['date']} {entry['time']}: {decrypted_entry}"
                    if 'tags' in entry and entry['tags']:
                        entry_str += f" (Tags: {', '.join(entry['tags'])})"
                    self.entriesList.addItem(entry_str)
            except Exception as e:
                print(f"Error al desencriptar: {e}")
                self.entriesList.addItem(f"Error al desencriptar entrada del {entry['date']} {entry['time']}")

    def loadEntries(self, filename="journal.json"):
        """Carga las entradas del diario desde un archivo."""
        try:
            with open(filename, 'r') as file:
                loaded_entries = json.load(file)
                if isinstance(loaded_entries, list):
                    self.journalEntries = loaded_entries
                    self.updateEntriesList()
                    self.messageLabel.setText(f"Entradas cargadas correctamente desde '{filename}'.")
                else:
                    QMessageBox.warning(self, "Error de Formato", "El archivo no contiene una lista válida de entradas.")
        except FileNotFoundError:
            self.messageLabel.setText("Archivo no encontrado. Se creará uno nuevo al guardar.")
        except json.JSONDecodeError:
            QMessageBox.critical(self, "Error de Decodificación", "Error al decodificar el archivo JSON.")

    def saveEntries(self, filename="journal.json"):
        """Guarda las entradas del diario en un archivo."""
        try:
            with open(filename, 'w') as file:
                json.dump(self.journalEntries, file, indent=4)
            self.messageLabel.setText(f"Entradas guardadas correctamente en '{filename}'.")
        except Exception as e:
            QMessageBox.critical(self, "Error al Guardar", f"Ocurrió un error al guardar el archivo: {e}")

    def updateEntriesList(self):
        """Actualiza la lista de entradas en la interfaz."""
        self.entriesList.clear()
        key = self.load_key()
        f = Fernet(key)
        for entry in self.journalEntries:
            try:
                decrypted_entry = f.decrypt(entry['entry'].encode()).decode()
                entry_str = f"{entry['date']} {entry['time']}: {decrypted_entry}"
                if 'tags' in entry and entry['tags']:
                    entry_str += f" (Tags: {', '.join(entry['tags'])})"
                self.entriesList.addItem(entry_str)
            except Exception as e:
                print(f"Error al desencriptar: {e}")
                self.entriesList.addItem(f"Error al desencriptar entrada del {entry['date']} {entry['time']}")

    def closeEvent(self, event):
        """Maneja el evento de cierre de la ventana."""
        reply = QMessageBox.question(self, 'Salir', '¿Deseas guardar los cambios antes de salir?',
                                     QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel, QMessageBox.Cancel)
        if reply == QMessageBox.Yes:
            self.saveEntries()
            event.accept()
        elif reply == QMessageBox.No:
            event.accept()
        else:
            event.ignore()

# Inicializar la aplicación
if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = JournalApp()
    window.show()
    sys.exit(app.exec())