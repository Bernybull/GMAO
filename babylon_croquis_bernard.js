// babylon_test_croquis.js
import * as BABYLON from "@babylonjs/core/Legacy/legacy";
import { GridMaterial } from "@babylonjs/materials/Grid";
import * as GUI from "@babylonjs/gui";
import { drawFunctions } from "./2d/compo.js";
import {
    closeAllMenus,
    openMenus,
    currentOpenSubMenu,
    currentActiveButton,
    boutonRond,
    hAL,
    hAR,
    vAB,
    vAT,
    getGuiPositionFromPointer,
    createPopup
} from "./2d/utils.js";

export default class babylon {
    constructor(_canvas, _nCategorie, _nType) {
        this.engine = null;
        this.scene = null;
        this.bLoad = false;
        this._cloture = null;
        this._portail = null;
        this._canvas = _canvas;
        this._nCategorie = _nCategorie;
        this._nType = _nType;
        this.img = null;
        this.camera = null;
        this.planes = [];
        this.discs = [];
        this.lines = [];
        this.textBoxes = [];
        this.magnetizationEnabled = false;
        this.defaultDiscMaterial = null;
        this.selectedDiscMaterial = null;
        this.lockedDiscMaterial = null;
        this.gridSize = 50;
        this.fontBox = 40;
        this.grid = null;
        this.gridVisible = true; // Ajout de la propriété pour gérer la visibilité de la grille
        this.lineNumbersDisplayed = false;
        this.lineMeterDisplayed = false;
        this.modePlan = false;
        this.advancedTexture = null;
        this.currentComposition = "Continue";
        this.discContextMenu = null;
        this.discRadius = 0.75; // Assurez-vous que this.discRadius est bien initialisé ici
        this.labelContextMenu = null;
        this.compoContextMenu = null; // Permet de fermer le menu si clic en dehors
        this.currentDisc = null;
        this.currentLineInfo = null;
        this.history = [];
        this.redoStack = [];
        this.isUndoRedo = false;
        this.maxHistory = 50;
        this.createScene();
    }

    async createScene() {
        var adapter = null;
        var engine = null;
        if (adapter != null) {
            // Initialisation de l'engin WebGPU (commenté car non utilisé)
            // engine = new WebGPUEngine(this._canvas);
            // await engine.initAsync()
        } else {
            engine = new BABYLON.Engine(this._canvas);
        }

        // engine.setHardwareScalingLevel(0.4);
        var scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color3(1, 1, 1);

        // **************************** Activer l'éditeur de débogage **********************************
        // scene.debugLayer.show();
        // *********************************************************************************************

        // Caméra orthographique
        this.camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 50, -this.gridSize / 2), scene); // Position initiale cohérente
        this.camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        // Appel initial de updateCameraOrthoParams pour ajuster la caméra dès le départ
        this.updateCameraOrthoParams(engine.getRenderWidth(), engine.getRenderHeight());

        // Cibler la position (0, 0, 0)
        this.camera.attachControl(this._canvas, true);
        this.camera.inputs.clear(); // Désactiver le mouvement de la caméra

        // Tourner la caméra pour qu'elle regarde vers le bas
        this.camera.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);

        // Grille
        const gridMaterial = new GridMaterial("grid", scene);
        gridMaterial.lineColor = new BABYLON.Color3(0, 0, 0);
        gridMaterial.mainColor = new BABYLON.Color3(0.95, 1, 0.95); // Fond vert clair

        this.grid = BABYLON.MeshBuilder.CreateGround("grid", { width: this.gridSize, height: this.gridSize }, scene);
        this.grid.position.y = -0.1;
        this.grid.material = gridMaterial;
        this.grid.isVisible = this.gridVisible; // Contrôle de la visibilité

        let snapToHorizontal = false;
        let snapToVertical = false;
        this.textBoxContextMenu = null;

        const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this._dragInfo = { active: false, moved: false };
        this._textDragInfo = { active: false, moved: false };
        this.advancedTexture = advancedTexture;

        // === Historique : push, undo, redo
        this.pushHistory = (label = "") => {
            if (this.isUndoRedo) return;
            try {
                const json = this.saveSceneToJSON(); // snapshot complet
                this.history.push({ json, label, ts: Date.now() });
                if (this.history.length > this.maxHistory) {
                    this.history.shift();
                }
                // Une nouvelle action invalide la pile redo
                this.redoStack = [];
            } catch (e) {
                console.warn("pushHistory error:", e);
            }
        };

        this.undo = async () => {
            if (this.history.length <= 1) return;
            const current = this.history.pop();
            this.redoStack.push(current);
            const prev = this.history[this.history.length - 1];
            this.isUndoRedo = true;
            try {
                await this.loadSceneFromJSON(prev.json);
            } finally {
                this.isUndoRedo = false;
            }
        };

        this.redo = async () => {
            if (this.redoStack.length === 0) return;
            const next = this.redoStack.pop();
            this.isUndoRedo = true;
            try {
                await this.loadSceneFromJSON(next.json);
                this.history.push(next);
            } finally {
                this.isUndoRedo = false;
            }
        };

        // Matériau lignes fines
        this.defaultLineMaterial = new BABYLON.StandardMaterial("defaultLineMaterial", scene);
        this.defaultLineMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0); // Noir

        // Disques
        this.defaultDiscMaterial = new BABYLON.StandardMaterial("defaultDiscMaterial", scene);
        this.defaultDiscMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0); // Couleur noire par défaut

        this.selectedDiscMaterial = new BABYLON.StandardMaterial("selectedDiscMaterial", scene);
        this.selectedDiscMaterial.emissiveColor = new BABYLON.Color3(0, 0.3, 1); // Couleur bleue pour la sélection

        this.lockedDiscMaterial = new BABYLON.StandardMaterial("lockedDiscMaterial", scene);
        this.lockedDiscMaterial.emissiveColor = new BABYLON.Color3(1, 0, 0); // Couleur rouge pour les disques verrouillés

        // Gestion des déplacements des disques
        const onPointerMove = (evt) => {
            if (evt.type === BABYLON.PointerEventTypes.POINTERMOVE) {
                this.discs.forEach(disc => {
                    if (disc.isDragging) {
                        if (this.isDiscMovable(disc)) {
                            const pickInfo = scene.pick(scene.pointerX, scene.pointerY);
                            if (pickInfo.hit) {
                                // Obtenir la nouvelle position
                                let newPosition = pickInfo.pickedPoint.clone();
                                newPosition.y = 0.1; // S'assurer que y = 0
                                if (snapToHorizontal && snapToVertical) {
                                    newPosition.x = Math.round(newPosition.x);
                                    newPosition.z = Math.round(newPosition.z);
                                } else if (snapToHorizontal) {
                                    newPosition.z = Math.round(newPosition.z);
                                } else if (snapToVertical) {
                                    newPosition.x = Math.round(newPosition.x);
                                }

                                // Gérer les contraintes
                                let constrainedPosition = newPosition.clone();
                                this.lines.forEach(lineInfo => {
                                    if (lineInfo.startDisc === disc || lineInfo.endDisc === disc) {
                                        let otherDisc = (lineInfo.startDisc === disc) ? lineInfo.endDisc : lineInfo.startDisc;

                                        if (lineInfo.isLocked) {
                                            if (otherDisc.isLocked) {
                                                // La ligne et l'autre disque sont verrouillés
                                                // Contraindre le mouvement le long du cercle
                                                let center = otherDisc.position.clone();
                                                let radius = lineInfo.lockedLength;
                                                let direction = newPosition.subtract(center).normalize();
                                                constrainedPosition = center.add(direction.scale(radius));
                                            } else {
                                                // La ligne est verrouillée, l'autre disque est déverrouillé

                                                // Déplacer l'autre disque pour maintenir la longueur
                                                otherDisc.position = newPosition.add(
                                                    otherDisc.position.subtract(disc.position)
                                                );
                                                otherDisc.position.y = 0.1; // S'assurer que y = 0
                                            }
                                        }
                                    }
                                });

                                constrainedPosition.y = 0.1; // S'assurer que y = 0
                                disc.position = constrainedPosition;

                                // ✅ Marquer qu'un déplacement a eu lieu
                                this._dragInfo.moved = true;

                                updateLines();
                                if (this.magnetizationEnabled) {
                                    checkForMerge(disc);
                                }

                                // Mettre à jour la taille du plan si le disque est un coin de plan
                                if (disc.isCornerDisc && disc.updateCallback) {
                                    disc.updateCallback(disc);
                                }
                            }
                        } else {
                            // Si le disque n'est pas déplaçable, arrêter le déplacement
                            disc.isDragging = false;
                            disc.isSelected = false;
                            disc.material = disc.isLocked ? this.lockedDiscMaterial : this.defaultDiscMaterial;
                        }
                    }
                });
                if (this.discContextMenu && this.currentDisc) {
                    const pickInfo = scene.pick(scene.pointerX, scene.pointerY);
                    if (pickInfo.hit && BABYLON.Vector3.Distance(pickInfo.pickedPoint, this.currentDisc.position) > 1) {
                        this.advancedTexture.removeControl(this.discContextMenu);
                        this.discContextMenu = null;
                        this.currentDisc = null;
                    }
                }
                // Gestion du menu contextuel du label
                if (this.labelContextMenu && this.currentLineInfo) {
                    const mouseX = scene.pointerX;
                    const mouseY = scene.pointerY;
                    const menuLeft = parseFloat(this.labelContextMenu.left);
                    const menuTop = parseFloat(this.labelContextMenu.top);
                    const menuWidth = parseFloat(this.labelContextMenu.width);
                    const menuHeight = parseFloat(this.labelContextMenu.height);

                    if (mouseX < menuLeft || mouseX > menuLeft + menuWidth || mouseY < menuTop || mouseY > menuTop + menuHeight) {
                        this.advancedTexture.removeControl(this.labelContextMenu);
                        this.labelContextMenu = null;
                        this.currentLineInfo = null;
                    }
                }
            }
        };

        // Gestion du relâchement (fin du drag)
        const onPointerUp = () => {
            this.discs.forEach(disc => {
                if (disc.isDragging) {
                    disc.isDragging = false;
                    disc.isSelected = false;
                    disc.material = disc.isLocked ? this.lockedDiscMaterial : this.defaultDiscMaterial;
                }
            });

            // Si un drag était en cours → on enregistre un état uniquement si la position a changé
            if (this._dragInfo.active) {
                if (this._dragInfo.moved) {
                    this.pushHistory("move disc");   // ✅ snapshot à la fin du déplacement
                }
                // Réinitialisation des drapeaux
                this._dragInfo.active = false;
                this._dragInfo.moved = false;
            }
        };

        // const onPointerUp = () => {
        //     let anyDragEnded = false;

        //     this.discs.forEach(disc => {
        //         if (disc.isDragging) {
        //             disc.isDragging = false;
        //             disc.isSelected = false;
        //             disc.material = disc.isLocked ? this.lockedDiscMaterial : this.defaultDiscMaterial;
        //             anyDragEnded = true;
        //         }
        //     });

        //     if (anyDragEnded) {
        //         this.pushHistory("move disc"); // ✅ un seul snapshot pour tous les discs relâchés
        //     }
        // };

        scene.onPointerObservable.add(onPointerMove);
        scene.onPointerObservable.add(onPointerUp, BABYLON.PointerEventTypes.POINTERUP);

        // Gestionnaire de clic global pour fermer les menus contextuels ouverts
        scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
                const evt = pointerInfo.event;
                if (evt.button !== 0) return; // Ne gérer que les clics gauche

                // Vérifier si un menu contextuel est ouvert
                if (openMenus.length > 0 || this.textBoxContextMenu) {
                    const pointerPos = getGuiPositionFromPointer(evt.clientX, evt.clientY, this._canvas, engine);
                    const clickX = pointerPos.x;
                    const clickY = pointerPos.y;

                    // Fonction pour vérifier si le clic est à l'intérieur d'un menu
                    const isClickInsideMenu = (menu) => {
                        if (!menu) return false;

                        const left = parseFloat(menu.left);
                        const top = parseFloat(menu.top);
                        const width = parseFloat(menu.width);
                        const height = parseFloat(menu.height);

                        return (
                            clickX >= left &&
                            clickX <= left + width &&
                            clickY >= top &&
                            clickY <= top + height
                        );
                    };

                    // Vérifier si le clic est à l'intérieur de l'un des menus contextuels ouverts
                    const clickInsideAnyMenu = openMenus.some(menu => isClickInsideMenu(menu)) ||
                        (this.textBoxContextMenu && isClickInsideMenu(this.textBoxContextMenu));

                    if (!clickInsideAnyMenu) {
                        // Fermer tous les menus
                        closeAllMenus();
                        if (this.textBoxContextMenu) {
                            this.advancedTexture.removeControl(this.textBoxContextMenu);
                            this.textBoxContextMenu = null;
                        }
                    }
                }
            }
        });

        // Définir tous les boutons
        this.saveButton = boutonRond("SAVE", "red", "18", hAL, vAT, "20", "20");
        this.loadButton = boutonRond("LOAD", "green", "18", hAL, vAT, "20", "90");
        this.undoButton = boutonRond("↶", "orange", "55", hAL, vAT, "20", "160"); // sous NEW
        this.redoButton = boutonRond("↷", "orange", "55", hAL, vAT, "20", "230"); // sous Undo
        this.newButton = boutonRond("NEW", "blue", "20", hAL, vAT, "20", "300");
        this.printButton = boutonRond("PRINT", "blue", "16", hAL, vAB, "20", "-20");
        this.jpgButton = boutonRond("JPG", "blue", "20", hAL, vAB, "20", "-90");
        this.planButton = boutonRond("PLAN", "purple", "18", hAR, vAT, "-20", "20");
        this.gridButton = boutonRond("▦", "rgb(199, 253, 199)", "50", hAR, vAT, "-20", "90");
        this.grid25Button = boutonRond("25", "grey", "26", hAR, vAT, "-20", "160");
        this.grid50Button = boutonRond("50", "grey", "26", hAR, vAT, "-20", "230");
        this.grid100Button = boutonRond("100", "grey", "26", hAR, vAT, "-20", "300");
        this.meterButton = boutonRond("m", "green", "40", hAR, vAB, "-20", "-370");
        this.addButton = boutonRond("+", "blue", "60", hAR, vAB, "-20", "-370");
        this.numberButton = boutonRond("①", "green", "40", hAR, vAB, "-20", "-300");
        this.planeButton = boutonRond("ﷹ", "green", "65", hAR, vAB, "-20", "-300");
        this.textButton = boutonRond("TEXT", "green", "18", hAR, vAB, "-20", "-230");
        this.balButton = boutonRond("BaL", "green", "18", hAR, vAB, "-20", "-160");
        this.uButton = boutonRond("ῦ", "orange", "60", hAR, vAB, "-20", "-160");
        this.hButton = boutonRond("H", "red", "30", hAR, vAB, "-20", "-90");
        this.vButton = boutonRond("V", "red", "30", hAR, vAB, "-20", "-20");

        // Ajouter les boutons à l'interface
        this.advancedTexture.addControl(this.saveButton);
        this.advancedTexture.addControl(this.loadButton);
        this.advancedTexture.addControl(this.undoButton);
        this.advancedTexture.addControl(this.redoButton);
        this.advancedTexture.addControl(this.newButton);
        advancedTexture.addControl(this.printButton);
        advancedTexture.addControl(this.jpgButton);
        this.advancedTexture.addControl(this.planButton);
        advancedTexture.addControl(this.gridButton);
        this.advancedTexture.addControl(this.grid25Button);
        advancedTexture.addControl(this.grid50Button);
        advancedTexture.addControl(this.grid100Button);
        this.advancedTexture.addControl(this.meterButton);
        this.advancedTexture.addControl(this.addButton);
        this.advancedTexture.addControl(this.numberButton);
        this.advancedTexture.addControl(this.planeButton);
        this.advancedTexture.addControl(this.textButton);
        this.advancedTexture.addControl(this.balButton);
        this.advancedTexture.addControl(this.uButton);
        this.advancedTexture.addControl(this.hButton);
        this.advancedTexture.addControl(this.vButton);

        // Snapshot initial (état vide)
        setTimeout(() => this.pushHistory("init"), 0);

        // Raccourcis clavier : Ctrl/Cmd+Z et Ctrl/Cmd+Y
        scene.onKeyboardObservable.add(async (kbInfo) => {
            if (kbInfo.type !== BABYLON.KeyboardEventTypes.KEYDOWN) return;
            const e = kbInfo.event;
            const ctrlOrMeta = e.ctrlKey || e.metaKey;
            if (!ctrlOrMeta) return;

            if (e.key.toLowerCase() === "z") {
                e.preventDefault();
                await this.undo();
            } else if (e.key.toLowerCase() === "y") {
                e.preventDefault();
                await this.redo();
            }
        });


        // Définir le tableau guiElements
        this.guiElements = [
            this.loadButton, this.newButton, this.planButton, this.gridButton,
            this.jpgButton, this.printButton, this.grid100Button, this.grid50Button, this.grid25Button,
            this.addButton, this.planeButton, this.textButton, this.uButton,
            this.hButton, this.vButton, this.numberButton
        ];

        // Définir les fonctions de masquage et d'affichage
        this.hideGuiElements = () => {
            this.guiElements.forEach(element => {
                if (element) {
                    element.isVisible = false;
                }
            });
        };

        this.showGuiElements = () => {
            this.guiElements.forEach(element => {
                if (element) {
                    element.isVisible = true;
                }
            });
        };

        // Vérifie si les disques doivent être fusionnés
        const checkForMerge = (draggedDisc) => {
            const mergeThreshold = 1.2; // Distance seuil pour la fusion
            this.discs.forEach(disc => {
                if (disc !== draggedDisc && BABYLON.Vector3.Distance(draggedDisc.position, disc.position) < mergeThreshold) {
                    mergeDiscs(draggedDisc, disc);
                }
            });
        };

        // Fusionne deux disques sans déplacer le disque cible
        const mergeDiscs = (draggedDisc, targetDisc) => {
            // Sauvegarder l’état AVANT la fusion
            this.pushHistory("merge discs");

            // Déplacer le disque déplacé à la position du disque cible
            draggedDisc.position.copyFrom(targetDisc.position);

            // Supprimer le disque déplacé
            draggedDisc.dispose();
            const index = this.discs.indexOf(draggedDisc);
            if (index > -1) {
                this.discs.splice(index, 1);
            }

            // Mettre à jour les lignes connectées au disque déplacé
            this.lines.forEach(lineInfo => {
                if (lineInfo.startDisc === draggedDisc) {
                    lineInfo.startDisc = targetDisc;
                }
                if (lineInfo.endDisc === draggedDisc) {
                    lineInfo.endDisc = targetDisc;
                }
            });

            // Si le disque déplacé était un coin, mettre à jour le plan
            if (draggedDisc.isCornerDisc) {
                this.planes.forEach(planeInfo => {
                    const cornerIndex = planeInfo.discs.indexOf(draggedDisc);
                    if (cornerIndex > -1) {
                        planeInfo.discs[cornerIndex] = targetDisc;
                        targetDisc.isCornerDisc = true;
                        this.updatePlaneSize(targetDisc, planeInfo.discs, planeInfo.plane);
                    }
                });
            }
            updateLines();
        };


        // Ajoute un disque à une position donnée
        const addDiscAtPosition = (position, updateCallback) => {
            const disc = BABYLON.MeshBuilder.CreateDisc("disc", { radius: this.discRadius, tessellation: 10 }, scene);

            // Détermine la taille de l'échelle en fonction de la grille actuelle
            let discScaleFactor;
            if (this.gridSize === 25) {
                discScaleFactor = 0.25; // Plus petit pour la grille de 25
            } else if (this.gridSize === 50) {
                discScaleFactor = 0.5; // Taille idéale pour la grille de 50
            } else if (this.gridSize === 100) {
                discScaleFactor = 0.75; // Plus grand pour la grille de 100
            }

            // Applique l'échelle au nouveau disque
            disc.scaling = new BABYLON.Vector3(discScaleFactor, discScaleFactor, discScaleFactor);

            disc.id = BABYLON.Tools.RandomId(); // Génère un identifiant unique
            disc.name = disc.id; // Assigner le même ID comme nom pour facilité
            disc.rotation.x = Math.PI / 2;
            disc.position = position.clone();
            disc.position.y = 0.1;
            disc.isSelected = false;
            disc.isLocked = false;
            disc.material = this.defaultDiscMaterial;
            disc.updateCallback = updateCallback;
            disc.isCornerDisc = false;
            this.discs.push(disc); // Ajouter à la liste des disques

            // Rend le disque déplaçable
            disc.actionManager = new BABYLON.ActionManager(scene);
            disc.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
                BABYLON.ActionManager.OnPickDownTrigger, (evt) => {
                    disc.isSelected = true;
                    disc.material = disc.isLocked ? this.lockedDiscMaterial : this.selectedDiscMaterial;

                    if (this.isDiscMovable(disc)) {
                        this._dragInfo.active = true;
                        this._dragInfo.moved = false;
                        disc.isDragging = true;
                    } else {
                        disc.isDragging = false;
                    }
                }
            ));

            disc.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickUpTrigger, (evt) => {
                disc.isDragging = false;
                disc.isSelected = false;
                disc.material = disc.isLocked ? this.lockedDiscMaterial : this.defaultDiscMaterial; // Revenir à la couleur appropriée
            }));

            // Désactive le menu contextuel pour les disques de coins de plan
            if (!disc.isCornerDisc) {
                disc.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnRightPickTrigger, (evt) => {
                    showDiscContextMenu(disc);
                }));
            }
            return disc;
        };

        const showDiscContextMenu = (disc) => { // Affiche le menu contextuel pour un disque donné
            closeAllMenus(); // Fermer tous les menus ouverts avant d'en ouvrir un nouveau

            // Créer un nouveau menu contextuel pour le disque
            const contextDiscMenu = new GUI.StackPanel("BlocMenuDisc");
            contextDiscMenu.width = "30px";
            contextDiscMenu.height = "90px";
            contextDiscMenu.background = "rgba(0,0,0,0)";
            contextDiscMenu.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            contextDiscMenu.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;

            // Ajouter des boutons au menu
            const menuButton = GUI.Button.CreateSimpleButton("menuButton", "+");
            menuButton.width = "30px";
            menuButton.height = "30px";
            menuButton.color = "white";
            menuButton.fontSize = "30px";
            menuButton.cornerRadius = 5;
            menuButton.fontStyle = "bold";
            menuButton.background = "blue";
            contextDiscMenu.addControl(menuButton);

            const deleteButton = GUI.Button.CreateSimpleButton("deleteButton", "-");
            deleteButton.width = "30px";
            deleteButton.height = "30px";
            deleteButton.color = "white";
            deleteButton.fontSize = "30px";
            deleteButton.cornerRadius = 5;
            deleteButton.fontStyle = "bold";
            deleteButton.background = "red";
            contextDiscMenu.addControl(deleteButton);

            const lockButton = GUI.Button.CreateSimpleButton("lockButton", "☼");
            lockButton.width = "30px";
            lockButton.height = "30px";
            lockButton.color = "white";
            lockButton.fontSize = "30px";
            lockButton.cornerRadius = 5;
            lockButton.fontStyle = "bold";
            lockButton.background = disc.isLocked ? "red" : "green";
            contextDiscMenu.addControl(lockButton);

            // Positionner le menu à côté du disque sélectionné
            const screenPosition = BABYLON.Vector3.Project(
                disc.position,
                BABYLON.Matrix.Identity(),
                scene.getTransformMatrix(),
                this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
            );

            contextDiscMenu.left = `${screenPosition.x + 5}px`;
            contextDiscMenu.top = `${screenPosition.y - 45}px`;

            // Ajout des actions des boutons
            menuButton.onPointerClickObservable.add(() => {
                addDiscRelativeTo(disc);
                closeAllMenus(); // Fermer les menus après action
            });

            deleteButton.onPointerClickObservable.add(() => {
                removeDisc(disc);
                closeAllMenus(); // Fermer les menus après suppression
            });

            lockButton.onPointerClickObservable.add(() => {
                disc.isLocked = !disc.isLocked;
                lockButton.background = disc.isLocked ? "red" : "green";
                disc.material = disc.isLocked ? this.lockedDiscMaterial : this.defaultDiscMaterial;
                this.pushHistory(disc.isLocked ? "lock disc" : "unlock disc");
            });

            // Ajoute le menu à l'interface utilisateur
            this.advancedTexture.addControl(contextDiscMenu);
            openMenus.push(contextDiscMenu);
        };

        const removeDisc = (disc) => {
            if (disc.isCornerDisc) {
                // Vérifier si le disc est connecté à une ligne
                const isConnectedToLine = this.lines.some(line => line.startDisc === disc || line.endDisc === disc);
                if (!isConnectedToLine) {
                    // Trouver tous les plans contenant ce disc
                    const planesToRemove = this.planes.filter(planeInfo => planeInfo.discs.includes(disc));
                    planesToRemove.forEach(planeInfo => {
                        removePlane(planeInfo);
                        this.pushHistory("remove plane");
                    });
                } else {
                    return;
                }
            } else {
                // Supprimer toutes les lignes attachées à ce disc
                for (let i = this.lines.length - 1; i >= 0; i--) {
                    const lineInfo = this.lines[i];
                    if (lineInfo.startDisc === disc || lineInfo.endDisc === disc) {
                        if (lineInfo.fineLine) lineInfo.fineLine.dispose();
                        if (lineInfo.clotureLine) lineInfo.clotureLine.dispose();
                        // Correction ici : on doit disposer de lineInfo.porteLine et non de clotureLine
                        if (lineInfo.porteLine) lineInfo.porteLine.dispose();
                        this.advancedTexture.removeControl(lineInfo.label);
                        this.advancedTexture.removeControl(lineInfo.sizeLabel);
                        if (lineInfo.numberLabel) {
                            this.advancedTexture.removeControl(lineInfo.numberLabel);
                        }
                        this.lines.splice(i, 1);
                    }
                }
                // Supprimer le disque lui-même
                disc.dispose();
                const index = this.discs.indexOf(disc);
                if (index > -1) {
                    this.discs.splice(index, 1);

                }
            }
            updateLines();
        };


        // Supprime un plan et ses disques de coins
        const removePlane = (planeInfo) => {
            planeInfo.plane.dispose();

            // Supprimer tous les disques de coins associés au plan
            planeInfo.discs.forEach(disc => {
                // Vérifier si le disc est connecté à une ligne avant de le supprimer
                const isConnectedToLine = this.lines.some(line => line.startDisc === disc || line.endDisc === disc);

                if (!isConnectedToLine) {
                    disc.dispose();
                    const index = this.discs.indexOf(disc);
                    if (index > -1) {
                        this.discs.splice(index, 1);
                    }
                }
            });

            // Supprimer le plan de la liste des planes
            const index = this.planes.indexOf(planeInfo);
            if (index > -1) {
                this.planes.splice(index, 1);
            }
        };

        // Fonction pour ajouter des disques avec une ligne (Modifiée)
        const addDiscsWithLine = () => {
            // Détermine la taille en fonction de la grille
            let discScaleFactor;
            if (this.gridSize === 25) {
                discScaleFactor = 0.25;
            } else if (this.gridSize === 50) {
                discScaleFactor = 0.5;
            } else if (this.gridSize === 100) {
                discScaleFactor = 0.75;
            }

            const distance = this.gridSize / 10;
            const center = new BABYLON.Vector3(0, 0, 0);
            const leftDisc = addDiscAtPosition(center.add(new BABYLON.Vector3(-distance / 2, 0, 0)));
            const rightDisc = addDiscAtPosition(center.add(new BABYLON.Vector3(distance / 2, 0, 0)));
            leftDisc.scaling = new BABYLON.Vector3(discScaleFactor, discScaleFactor, discScaleFactor);
            rightDisc.scaling = new BABYLON.Vector3(discScaleFactor, discScaleFactor, discScaleFactor);

            // Appel de la fonction CreateLine qui crée fineLine, clotureLine, porteLine, etc.
            const lines = CreateLine("line", [leftDisc.position, rightDisc.position], scene);

            // Création de l'objet lineInfo et initialisation de selectedMainOption
            const lineInfo = {
                id: BABYLON.Tools.RandomId(),
                fineLine: lines.fineLine,
                clotureLine: lines.clotureLine,
                clotureTexture: lines.clotureTexture,
                clotureMaterial: lines.clotureMaterial,
                porteTexture: lines.porteTexture,
                porteMaterial: lines.porteMaterial,
                porteLine: lines.porteLine,
                startDisc: leftDisc,
                endDisc: rightDisc,
                isLocked: false,
                currentComposition: "Continue", // Par défaut, vous pouvez ajuster
                flipHorizontal: false,
                flipVertical: false,
                // Initialisation de l'objet stockant les sélections des menus principaux
                selectedMainOption: {
                    Ligne: "",
                    Clôture: "",
                    Ouvrant: "",
                    Coulissant: ""
                }
            };

            this.lines.push(lineInfo);
            addLabelForLine(lineInfo);
            drawFunctions.drawShapesOnclotureTexture(lineInfo); // Dessin initial de la clôture
            drawFunctions.drawShapesOnporteTexture(lineInfo);    // Dessin initial de la porte (texture vide)
            this.pushHistory("add line");
        };

        // Ajoute une étiquette pour une ligne
        const addLabelForLine = (lineInfo) => {
            const sizeLabel = new GUI.Rectangle("SizeLabel");
            sizeLabel.width = "40px";
            sizeLabel.height = "40px";
            sizeLabel.cornerRadius = 20;
            sizeLabel.color = "black";
            sizeLabel.thickness = 2;
            sizeLabel.background = "white";
            this.advancedTexture.addControl(sizeLabel);

            const label = new GUI.InputText();
            label.color = "white";
            label.fontSize = 10;
            label.width = "50px";
            label.height = "40px";
            label.background = lineInfo.isLocked ? "red" : "blue"; // Fond en fonction de l'état
            label.isReadOnly = lineInfo.isLocked; // Utiliser isReadOnly au lieu de isEnabled
            sizeLabel.addControl(label);
            lineInfo.label = label;
            lineInfo.sizeLabel = sizeLabel;
            this.updateLabelPosition(lineInfo);

            label.onFocusObservable.add(() => {
                label.text = "";
            });

            label.onBlurObservable.add(() => {
                const length = parseFloat(label.text);
                if (!isNaN(length)) {
                    // Mettre à jour les positions des disques en fonction de la nouvelle longueur
                    updateDiscPositionByLength(lineInfo, length);

                    // Si les disques sont des coins de plan, mettez à jour la taille et la position du plan
                    if (lineInfo.startDisc.isCornerDisc && lineInfo.endDisc.isCornerDisc) {
                        this.planes.forEach(planeInfo => {
                            if (planeInfo.discs.includes(lineInfo.startDisc) || planeInfo.discs.includes(lineInfo.endDisc)) {
                                this.updatePlaneSize(null, planeInfo.discs, planeInfo.plane);
                            }
                        });
                    }
                }
                this.updateLabelPosition(lineInfo);
                this.pushHistory("update line length");
            });

            // Ajoute la gestion du clic droit pour afficher le menu contextuel
            label.onPointerDownObservable.add((evt) => {
                if (evt.buttonIndex === 2) { // Clic droit
                    showLabelContextMenu(lineInfo);
                }
            });
        };

        // Fonction pour afficher le menu contextuel du label
        const showLabelContextMenu = (lineInfo) => {
            // Fermer tous les menus ouverts avant d'en ouvrir un nouveau
            closeAllMenus();

            // Créer un nouveau menu contextuel pour le label
            const contextLabelMenu = new GUI.StackPanel("BlocMenuLabel");
            contextLabelMenu.width = "30px";
            contextLabelMenu.height = "60px";
            contextLabelMenu.background = "rgba(0,0,0,0)";
            contextLabelMenu.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            contextLabelMenu.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;

            // Ajouter des boutons au menu
            const deleteLineButton = GUI.Button.CreateSimpleButton("deleteLineButton", "-");
            deleteLineButton.width = "30px";
            deleteLineButton.height = "30px";
            deleteLineButton.color = "white";
            deleteLineButton.background = "red";
            deleteLineButton.cornerRadius = 5;
            deleteLineButton.fontSize = "30px";
            deleteLineButton.fontStyle = "bold";
            contextLabelMenu.addControl(deleteLineButton);

            const lockLineButton = GUI.Button.CreateSimpleButton("lockLineButton", "☼");
            lockLineButton.width = "30px";
            lockLineButton.height = "30px";
            lockLineButton.color = "white";
            lockLineButton.cornerRadius = 5;
            lockLineButton.fontSize = "30px";
            lockLineButton.fontStyle = "bold";
            lockLineButton.background = lineInfo.isLocked ? "red" : "green";
            contextLabelMenu.addControl(lockLineButton);

            // Positionner le menu à côté de la ligne sélectionnée
            const screenPosition = BABYLON.Vector3.Project(
                lineInfo.fineLine.getBoundingInfo().boundingBox.centerWorld,
                BABYLON.Matrix.Identity(),
                scene.getTransformMatrix(),
                this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
            );

            contextLabelMenu.left = `${screenPosition.x + 20}px`;
            contextLabelMenu.top = `${screenPosition.y - 30}px`;

            // Ajout des actions des boutons
            deleteLineButton.onPointerClickObservable.add(() => {
                if (lineInfo.fineLine) lineInfo.fineLine.dispose();
                if (lineInfo.clotureLine) lineInfo.clotureLine.dispose();
                if (lineInfo.porteLine) lineInfo.porteLine.dispose();
                if (lineInfo.clotureTexture) lineInfo.clotureTexture.dispose();
                if (lineInfo.porteTexture) lineInfo.porteTexture.dispose();
                if (lineInfo.clotureMaterial) lineInfo.clotureMaterial.dispose();
                if (lineInfo.porteMaterial) lineInfo.porteMaterial.dispose();
                if (lineInfo.label) this.advancedTexture.removeControl(lineInfo.label);
                if (lineInfo.sizeLabel) this.advancedTexture.removeControl(lineInfo.sizeLabel);
                if (lineInfo.numberLabel) this.advancedTexture.removeControl(lineInfo.numberLabel);

                const index = this.lines.indexOf(lineInfo);
                if (index > -1) {
                    this.lines.splice(index, 1);
                }

                closeAllMenus(); // Fermer les menus après suppression
                this.pushHistory("delete line");
            });

            lockLineButton.onPointerClickObservable.add(() => {
                lineInfo.isLocked = !lineInfo.isLocked;
                lockLineButton.background = lineInfo.isLocked ? "red" : "green";
                if (lineInfo.label) {
                    lineInfo.label.background = lineInfo.isLocked ? "red" : "blue";
                    lineInfo.label.isReadOnly = lineInfo.isLocked;
                }

                if (lineInfo.isLocked) {
                    lineInfo.lockedLength = BABYLON.Vector3.Distance(lineInfo.startDisc.position, lineInfo.endDisc.position);
                } else {
                    lineInfo.lockedLength = null;
                }
                this.pushHistory(lineInfo.isLocked ? "lock line" : "unlock line");
            });


            // Ajouter le menu à l'interface utilisateur
            this.advancedTexture.addControl(contextLabelMenu);

            // Ajouter ce menu à la liste globale `openMenus`
            openMenus.push(contextLabelMenu);
        };

        // Met à jour la position des disques en fonction de la longueur entrée
        const updateDiscPositionByLength = (lineInfo, length) => {
            if (lineInfo.isLocked) return; // Ne pas modifier si la ligne est verrouillée
            const direction = lineInfo.endDisc.position.subtract(lineInfo.startDisc.position).normalize();
            if (!lineInfo.endDisc.isLocked && !lineInfo.startDisc.isLocked) {
                // Les deux disques sont déverrouillés
                const newEndPosition = lineInfo.startDisc.position.add(direction.scale(length));
                newEndPosition.y = 0.1; // S'assurer que y = 0
                lineInfo.endDisc.position = newEndPosition;
            } else if (!lineInfo.endDisc.isLocked) {
                // Seul le disque de fin est déverrouillé
                const newEndPosition = lineInfo.startDisc.position.add(direction.scale(length));
                newEndPosition.y = 0.1; // S'assurer que y = 0
                lineInfo.endDisc.position = newEndPosition;
            } else if (!lineInfo.startDisc.isLocked) {
                // Seul le disque de début est déverrouillé
                const newStartPosition = lineInfo.endDisc.position.subtract(direction.scale(length));
                newStartPosition.y = 0.1; // S'assurer que y = 0
                lineInfo.startDisc.position = newStartPosition;
            }
            updateLines();
        };

        // Ajoute un disque relatif à un disque de base (Modifiée)
        const addDiscRelativeTo = (baseDisc) => {
            let direction = new BABYLON.Vector3(1, 0, 0); // Direction par défaut

            // Trouve une ligne attachée au baseDisc
            let attachedLine = this.lines.find(lineInfo => lineInfo.startDisc === baseDisc || lineInfo.endDisc === baseDisc);

            if (attachedLine) {
                // Calcule la direction basée sur la ligne attachée
                if (attachedLine.startDisc === baseDisc) {
                    direction = attachedLine.endDisc.position.subtract(attachedLine.startDisc.position).normalize();
                } else {
                    direction = attachedLine.startDisc.position.subtract(attachedLine.endDisc.position).normalize();
                }
            }

            // Calculer la distance basée sur la taille de la grille
            const distance = this.gridSize / 10; // 10, 5 ou 2.5

            const newPosition = baseDisc.position.add(direction.scale(-distance)); // Position dynamique
            newPosition.y = 0.1; // S'assurer que y = 0
            const newDisc = addDiscAtPosition(newPosition);

            const lines = CreateLine("line", [baseDisc.position, newDisc.position], scene);
            const lineInfo = {
                fineLine: lines.fineLine,
                clotureLine: lines.clotureLine,
                porteLine: lines.porteLine,
                startDisc: baseDisc,
                endDisc: newDisc,
                isLocked: false,
                currentComposition: "Continue", // Initialiser la composition par défaut
                clotureTexture: lines.clotureTexture,
                porteTexture: lines.porteTexture,
                clotureMaterial: lines.clotureMaterial,
                porteMaterial: lines.porteMaterial
            };

            this.lines.push(lineInfo);
            addLabelForLine(lineInfo);
            drawFunctions.drawShapesOnclotureTexture(lineInfo); // Initialiser la composition
            drawFunctions.drawShapesOnporteTexture(lineInfo); // Initialiser la composition
            this.pushHistory("add line with disc");
        };

        const updateLines = () => {
            this.lines.forEach(lineInfo => {
                const points = [lineInfo.startDisc.position.clone(), lineInfo.endDisc.position.clone()];
                points[0].y = 0;
                points[1].y = 0;

                // Dispose des lignes existantes
                if (lineInfo.fineLine) {
                    lineInfo.fineLine.dispose();
                }
                if (lineInfo.clotureLine) {
                    lineInfo.clotureLine.dispose();
                }
                if (lineInfo.porteLine) {
                    lineInfo.porteLine.dispose();
                }
                // Dispose des matériaux et textures associés
                if (lineInfo.clotureMaterial) {
                    lineInfo.clotureMaterial.dispose();
                }
                if (lineInfo.porteMaterial) {
                    lineInfo.porteMaterial.dispose();
                }
                if (lineInfo.clotureTexture) {
                    lineInfo.clotureTexture.dispose();
                }
                if (lineInfo.porteTexture) {
                    lineInfo.porteTexture.dispose();
                }
                // Dispose des étiquettes GUI, excepté numberLabel
                if (lineInfo.label) {
                    this.advancedTexture.removeControl(lineInfo.label);
                    lineInfo.label.dispose(); // Dispose également l'objet GUI
                }
                if (lineInfo.sizeLabel) {
                    this.advancedTexture.removeControl(lineInfo.sizeLabel);
                    lineInfo.sizeLabel.dispose(); // Dispose également l'objet GUI
                }

                // Recrée les lignes (fine, cloture, porte)
                const newLines = CreateLine("line", points, scene);
                lineInfo.fineLine = newLines.fineLine;
                lineInfo.clotureLine = newLines.clotureLine;
                lineInfo.porteLine = newLines.porteLine;
                lineInfo.clotureTexture = newLines.clotureTexture;
                lineInfo.porteTexture = newLines.porteTexture;
                lineInfo.clotureMaterial = newLines.clotureMaterial;
                lineInfo.porteMaterial = newLines.porteMaterial;

                // Ajuste la visibilité des lignes en fonction du mode et de la distance
                lineInfo.fineLine.isVisible = !this.modePlan; // Fine line visible uniquement en mode normal
                lineInfo.clotureLine.isVisible = this.modePlan; // Cloture line visible uniquement en mode plan
                const distance = BABYLON.Vector3.Distance(points[0], points[1]);
                lineInfo.porteLine.isVisible = this.modePlan && (distance < 25);

                // Recrée les labels pour la nouvelle ligne
                addLabelForLine(lineInfo);

                // Met à jour les étiquettes
                this.updateLabelPosition(lineInfo);
                this.updateMeterLabelPosition(lineInfo);
                this.updateNumberLabelPosition(lineInfo);

                // Contrôle de la visibilité des labels en fonction du mode plan
                if (this.modePlan) {
                    // En mode Plan, afficher les numberLabel et masquer les autres labels
                    if (lineInfo.label) lineInfo.label.isVisible = false;
                    if (lineInfo.sizeLabel) lineInfo.sizeLabel.isVisible = false;
                    if (lineInfo.numberLabel) lineInfo.numberLabel.isVisible = true;
                } else {
                    // En mode Normal, masquer les numberLabel et afficher les autres labels
                    if (lineInfo.label) lineInfo.label.isVisible = true;
                    if (lineInfo.sizeLabel) lineInfo.sizeLabel.isVisible = true;
                    if (lineInfo.numberLabel) lineInfo.numberLabel.isVisible = false;
                }

                // Redessine la composition
                drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize); // Ajout de this.gridSize
                drawFunctions.drawShapesOnporteTexture(lineInfo, this.gridSize); // Ajout de this.gridSize

                // Initialise le menu contextuel pour chaque ligne
                lineInfo.clotureLine.actionManager = new BABYLON.ActionManager(scene);
                lineInfo.clotureLine.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
                    BABYLON.ActionManager.OnRightPickTrigger,
                    (evt) => {
                        showCompositionContextMenu(lineInfo, evt); // Passer "evt" correctement
                    }));

                // **Synchronisation des meterLabels avec sizeLabels**
                if (this.lineMeterDisplayed && lineInfo.meterLabel && lineInfo.label) {
                    const meterLabelText = lineInfo.meterLabel.children[0];
                    if (meterLabelText instanceof GUI.TextBlock) {
                        meterLabelText.text = `${lineInfo.label.text} \nm`;
                    }

                }
            });
        };


        // Fonction personnalisée pour créer des lignes
        const CreateLine = (name, points, scene) => {
            const midPoint = BABYLON.Vector3.Center(points[0], points[1]);
            const distance = BABYLON.Vector3.Distance(points[0], points[1]);

            // Déterminer l'épaisseur de la ligne fine en fonction de la taille de la grille
            let lineThicknessFactor;
            if (this.gridSize === 25) {
                lineThicknessFactor = 0.25;
            } else if (this.gridSize === 50) {
                lineThicknessFactor = 0.5;
            } else if (this.gridSize === 100) {
                lineThicknessFactor = 0.75;
            }

            // Création de la ligne fine noire
            const fineLine = BABYLON.MeshBuilder.CreatePlane(name + "_fine", { width: distance, height: (this.discRadius / 3) * lineThicknessFactor }, scene);
            fineLine.id = BABYLON.Tools.RandomId();
            fineLine.position = midPoint;
            const direction = points[1].subtract(points[0]).normalize();
            const angle = Math.atan2(direction.z, direction.x);
            fineLine.rotation.y = -angle;
            fineLine.rotation.x = Math.PI / 2;
            fineLine.material = this.defaultLineMaterial;

            // Création de la clotureTexture basée sur distance et pixelsPerUnit,
            const pixelsPerUnit = 100;

            // Création de la ligne cloture, largeur et hauteur multipliées par 3
            const clotureLine = BABYLON.MeshBuilder.CreatePlane(name + "_cloture", { width: distance, height: 1 }, scene);
            clotureLine.id = BABYLON.Tools.RandomId();
            clotureLine.position = midPoint;
            clotureLine.rotation.y = -angle;
            clotureLine.rotation.x = Math.PI / 2;
            // Création de clotureTexture
            const clotureTexture = new BABYLON.DynamicTexture(`clotureTexture_${fineLine.id}`, { width: Math.floor(distance * pixelsPerUnit), height: pixelsPerUnit }, scene, false);
            const ctc = clotureTexture.getContext();
            ctc.fillStyle = "rgba(0, 0, 0, 0)";
            ctc.fillRect(0, 0, clotureTexture.getSize().width, clotureTexture.getSize().height);
            clotureTexture.update();
            // Créer un matériau unique pour cette ligne clôture
            const clotureMaterial = new BABYLON.StandardMaterial(`clotureMaterial_${fineLine.id}`, scene);
            clotureMaterial.diffuseTexture = clotureTexture;
            clotureMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
            clotureMaterial.diffuseTexture.hasAlpha = true;
            clotureMaterial.useAlphaFromDiffuseTexture = true;
            clotureLine.material = clotureMaterial;
            clotureLine.isVisible = this.modePlan;

            // Création de la porteLine, largeur et hauteur multipliées par 3
            const porteLine = BABYLON.MeshBuilder.CreatePlane(name + "_porte", { width: distance * 3, height: 3 }, scene);
            porteLine.id = BABYLON.Tools.RandomId();
            porteLine.isPickable = false;
            porteLine.position = midPoint;
            porteLine.rotation.y = -angle;
            porteLine.rotation.x = Math.PI / 2;

            // Création de porteTexture avec transparence activée
            const porteTexture = new BABYLON.DynamicTexture(`porteTexture_${fineLine.id}`, { width: Math.floor(distance * (pixelsPerUnit * 3)), height: (pixelsPerUnit * 3) }, scene, false);
            porteTexture.hasAlpha = true;
            const ctp = porteTexture.getContext();

            // Vider le canvas en lui appliquant une couleur transparente
            ctp.clearRect(0, 0, porteTexture.getSize().width, porteTexture.getSize().height);
            ctp.fillStyle = "rgba(0,0,0,0)";
            ctp.fillRect(0, 0, porteTexture.getSize().width, porteTexture.getSize().height);
            porteTexture.update();

            // Créer un matériau unique pour cette porte
            const porteMaterial = new BABYLON.StandardMaterial(`porteMaterial_${fineLine.id}`, scene);
            porteMaterial.diffuseTexture = porteTexture;
            porteMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
            porteMaterial.diffuseTexture.hasAlpha = true;
            porteMaterial.useAlphaFromDiffuseTexture = true;
            porteLine.material = porteMaterial;
            porteLine.isVisible = this.modePlan;

            return { fineLine, clotureLine, clotureTexture, clotureMaterial, porteLine, porteTexture, porteMaterial };
        };

        // Boutons Gauches
        this.saveButton.onPointerClickObservable.add(() => {
            this.guiElements = [
                this.saveButton, this.loadButton, this.undoButton, this.redoButton, this.newButton, this.planButton, this.gridButton,
                this.jpgButton, this.printButton, this.grid100Button, this.grid50Button, this.grid25Button,
                this.addButton, this.planeButton, this.textButton, this.numberButton, this.uButton,
                this.hButton, this.vButton, this.meterButton, this.balButton
            ];

            createPopup(
                this.advancedTexture,
                this.guiElements,
                "Sauvegarder N° OFP",
                "000000(-01)",
                "CROQUIS OFP", // Ajout du préfixe ici
                (fileName) => {
                    // Sauvegarder la scène en JSON avec le nom spécifié
                    const sceneData = this.saveSceneToJSON();
                    this.downloadJSON(sceneData, fileName);
                },
                "json" // Extension de fichier
            );
        });

        // Configuration du bouton LOAD avec confirmation
        this.loadButton.onPointerClickObservable.add(() => {
            // Cacher tous les éléments GUI spécifiés
            this.hideGuiElements();

            // Créer le popup de confirmation
            createPopup(
                this.advancedTexture,
                this.guiElements, // Passer tous les éléments GUI pour qu'ils puissent être réaffichés
                "Effacer le projet actuel ?", // Titre du popup
                "", // Message principal
                "", // Sous-message (optionnel, peut rester vide)
                () => {
                    // Utilisateur a confirmé, procéder au chargement
                    this.uploadJSON(async (jsonData) => { // Rendre le callback asynchrone
                        try {
                            await this.loadSceneFromJSON(jsonData); // Attendre que le chargement soit terminé
                        } catch (error) {
                            alert("Une erreur s'est produite lors du chargement de la scène.");
                        } finally {
                            // Réafficher les éléments GUI après le chargement
                            this.showGuiElements();
                        }
                    });
                },
                () => {
                    // Utilisateur a annulé, réafficher les éléments GUI
                    this.showGuiElements();
                },
                true // Si nécessaire, selon la définition de createPopup
            );
        });

        // Configuration du bouton NEW avec confirmation
        this.newButton.onPointerClickObservable.add(() => {
            this.hideGuiElements();

            createPopup(
                this.advancedTexture,
                this.guiElements, // Passer tous les éléments GUI pour qu'ils puissent être réaffichés
                "Effacer le projet actuel ?", // Titre du popup
                "", // Message principal
                "", // Sous-message (optionnel, peut rester vide)
                () => {
                    this.discs.forEach(disc => disc.dispose());

                    this.lines.forEach(lineInfo => {
                        if (lineInfo.fineLine) lineInfo.fineLine.dispose();
                        if (lineInfo.clotureLine) lineInfo.clotureLine.dispose();
                        if (lineInfo.clotureTexture) lineInfo.clotureTexture.dispose();
                        if (lineInfo.clotureMaterial) lineInfo.clotureMaterial.dispose();
                        if (lineInfo.porteLine) lineInfo.porteLine.dispose();
                        if (lineInfo.porteTexture) lineInfo.porteTexture.dispose();
                        if (lineInfo.porteMaterial) lineInfo.porteMaterial.dispose();

                        this.advancedTexture.removeControl(lineInfo.label);
                        this.advancedTexture.removeControl(lineInfo.sizeLabel);
                        if (lineInfo.numberLabel) {
                            this.advancedTexture.removeControl(lineInfo.numberLabel);
                        }
                        if (lineInfo.meterLabel) {
                            this.advancedTexture.removeControl(lineInfo.meterLabel);
                        }
                    });

                    this.planes.forEach(planeInfo => {
                        if (planeInfo.plane) planeInfo.plane.dispose();
                        if (planeInfo.planeMaterial) planeInfo.planeMaterial.dispose();
                    });

                    this.textBoxes.forEach(textBox => {
                        this.advancedTexture.removeControl(textBox);
                    });

                    // Réinitialiser les tableaux
                    this.discs = [];
                    this.lines = [];
                    this.planes = [];
                    this.textBoxes = [];

                    this.planButton.color = "white";
                    this.modePlan = false;
                    this.grid.isVisible = true;
                    this.gridButton.color = "black";
                    // Restaurer uniquement les éléments dans guiElements
                    this.showGuiElements(); // Réafficher les éléments GUI après l'effacement

                },
                () => {
                    this.showGuiElements();
                },
                true // Si nécessaire, selon la définition de createPopup
            );
        });

        this.printButton.onPointerClickObservable.add(() => {
            this.guiElements = [
                this.saveButton, this.loadButton, this.newButton, this.planButton, this.gridButton,
                this.jpgButton, this.printButton, this.grid100Button, this.grid50Button, this.grid25Button,
                this.addButton, this.planeButton, this.textButton, this.numberButton, this.uButton,
                this.hButton, this.vButton
            ];

            // 1. Masquer les boutons avant la capture
            this.guiElements.forEach(element => element.isVisible = false);

            // 2. Attendre que la scène soit rendue sans les boutons
            scene.onAfterRenderObservable.addOnce(() => {
                // 3. Prendre la capture d'écran
                BABYLON.Tools.CreateScreenshot(this.engine, this.camera, { precision: 1.0 }, (dataURL) => {
                    // 4. Réafficher les boutons après la capture
                    this.guiElements.forEach(element => element.isVisible = true);

                    if (dataURL) {
                        // 5. Créer le contenu HTML pour la fenêtre d'impression
                        const windowContent = `
                            <html>
                                <head>
                                    <title>Imprimer le Croquis</title>
                                    <style>
                                        html, body {
                                            margin: 0;
                                            padding: 0;
                                            height: 100%;
                                            width: 100%;
                                            display: flex;
                                            justify-content: center;
                                            align-items: center;
                                            background-color: white;
                                        }
                                        img {
                                            max-width: 150%;
                                            height: auto;
                                        }
                                    </style>
                                </head>
                                <body onload="window.print(); window.close();">
                                    <img src="${dataURL}" />
                                </body>
                            </html>
                        `;

                        // 6. Ouvrir une nouvelle fenêtre pour l'impression
                        const printWin = window.open("", "_blank");
                        if (printWin) {
                            printWin.document.open();
                            printWin.document.write(windowContent);
                            printWin.document.close();
                        } else {
                            alert("Impossible d'ouvrir la fenêtre d'impression. Veuillez vérifier vos paramètres de navigateur.");
                        }
                    } else {
                        alert("Erreur lors de la capture de l'image!");
                    }
                });
            });

            // 7. Forcer le rendu pour déclencher onAfterRenderObservable
            scene.render();
        });

        this.jpgButton.onPointerClickObservable.add(() => {
            this.guiElements = [
                this.saveButton, this.loadButton, this.newButton, this.planButton, this.gridButton,
                this.jpgButton, this.printButton, this.grid100Button, this.grid50Button, this.grid25Button,
                this.addButton, this.planeButton, this.textButton, this.numberButton, this.uButton,
                this.hButton, this.vButton, this.meterButton, this.balButton
            ];

            // 1. Masquer les boutons avant la capture
            this.guiElements.forEach(element => element.isVisible = false);

            // 2. Attendre que la scène soit rendue sans les boutons
            scene.onAfterRenderObservable.addOnce(() => {
                // 3. Prendre la capture d'écran
                BABYLON.Tools.CreateScreenshot(this.engine, this.camera, { precision: 1.0 }, (dataURL) => {
                    // 4. Réafficher les boutons après la capture
                    this.guiElements.forEach(element => element.isVisible = true);

                    if (dataURL) {
                        // 5. Afficher le popup pour obtenir le nom du fichier
                        createPopup(
                            this.advancedTexture,
                            [], // Assurez-vous que le popup n'est pas inclus dans guiElements pour qu'il reste visible
                            "Enregistrer en JPG N° OFP",
                            "000000(-01)",
                            "CROQUIS OFP", // Ajout du préfixe ici
                            (fileName) => {
                                // Convertir le dataURL en blob pour le téléchargement
                                const blob = dataURLToBlob(dataURL);
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = fileName;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            },
                            "jpg" // Extension de fichier
                        );

                    } else {
                        alert("Erreur lors de la capture de l'image!");
                    }
                });
            });

            // Forcer le rendu pour déclencher onAfterRenderObservable
            scene.render();
        });

        function dataURLToBlob(dataURL) {
            const parts = dataURL.split(';base64,');
            const byteString = atob(parts[1]);
            const mimeString = parts[0].split(':')[1];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return new Blob([ab], { type: mimeString });
        }
        // Appels (nécessite les fonctions undo/redo déjà ajoutées dans createScene)
        this.undoButton.onPointerClickObservable.add(async () => {
            if (typeof this.undo === "function") await this.undo();
        });
        this.redoButton.onPointerClickObservable.add(async () => {
            if (typeof this.redo === "function") await this.redo();
        });

        this.planButton.onPointerClickObservable.add(async () => {
            this.modePlan = !this.modePlan; // Changer l'état du mode plan
            this.planButton.color = this.modePlan ? "black" : "white"; // Indiquer la sélection en changeant la couleur

            if (this.modePlan) {
                this.grid.isVisible = false; // Masquer la grille par défaut en mode plan
                this.gridButton.color = "white";
                this.discs.forEach(disc => {
                    disc.isVisible = false; // Masquer les disques
                });

                this.lines.forEach(lineInfo => {
                    lineInfo.fineLine.isVisible = false; // Masquer les fineLines
                    lineInfo.sizeLabel.isVisible = false;
                    lineInfo.clotureLine.isVisible = true;
                    lineInfo.porteLine.isVisible = true;
                });

                this.guiElements = [
                    this.addButton, this.grid25Button, this.grid50Button, this.grid100Button, this.planeButton, this.uButton, this.hButton, this.vButton
                ];
                this.guiElements.forEach(element => {
                    element.isVisible = false; // Masquer ces boutons
                });

                this.numberButton.isVisible = true; // Rendre le bouton visible en mode Plan
                this.meterButton.isVisible = true; // Rendre le bouton visible en mode Plan
                this.balButton.isVisible = true; // Rendre le bouton visible en mode Plan
                this.undoButton.isVisible = true;  // Rendre le bouton visible en mode Plan
                this.redoButton.isVisible = true; // Rendre le bouton visible en mode Plan

                // Si lineMeterDisplayed est actif, afficher les meterLabels
                if (this.lineMeterDisplayed) {
                    this.lines.forEach(lineInfo => {
                        if (["Continue", "Traits", "Points"].includes(lineInfo.currentComposition)) {
                            return; // Ne pas ajouter de meterLabel pour ces types
                        }

                        // Créer un conteneur pour meterLabel
                        const meterLabelContainer = new GUI.Rectangle(`meterLabel_${lineInfo.id}`);
                        meterLabelContainer.width = "50px";
                        meterLabelContainer.height = "30px";
                        meterLabelContainer.background = "rgba(0, 0, 0, 0)";
                        meterLabelContainer.thickness = 0;
                        this.advancedTexture.addControl(meterLabelContainer);

                        // Créer le TextBlock à l'intérieur du Rectangle
                        const meterLabelText = new GUI.TextBlock(`meterLabelText_${lineInfo.id}`, `${lineInfo.label.text} \nm`); // Ajout de "m" à la fin
                        meterLabelText.color = "black";
                        meterLabelText.fontSize = 12;
                        meterLabelText.fontStyle = "bold";
                        meterLabelText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                        meterLabelText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

                        meterLabelContainer.addControl(meterLabelText);  // Ajouter le TextBlock au Rectangle
                        this.advancedTexture.addControl(meterLabelContainer); // Ajouter le conteneur à l'interface utilisateur

                        lineInfo.meterLabel = meterLabelContainer; // Associer le conteneur au lineInfo

                        // Mettre à jour la position du label
                        this.updateMeterLabelPosition(lineInfo);
                    });
                }

            } else {
                // Restaurer la visibilité des disques
                this.discs.forEach(disc => {
                    disc.isVisible = true;
                });

                this.lines.forEach(lineInfo => {
                    lineInfo.fineLine.isVisible = true; // Rendre les fineLines visibles
                    lineInfo.sizeLabel.isVisible = true;
                    lineInfo.clotureLine.isVisible = false;
                    lineInfo.porteLine.isVisible = false;
                });

                if (isGridVisible) {
                    this.grid.isVisible = true;
                    this.gridButton.color = "black";
                }

                this.guiElements = [
                    this.addButton, this.grid25Button, this.grid50Button, this.grid100Button, this.planeButton, this.uButton, this.hButton, this.vButton
                ];
                this.guiElements.forEach(element => {
                    element.isVisible = true;
                });

                this.numberButton.isVisible = false; // Masquer le bouton en mode normal
                this.meterButton.isVisible = false; // Masquer le bouton en mode normal
                this.balButton.isVisible = false; // Masquer le bouton en mode normal

                // Supprimer tous les meterLabels
                this.lines.forEach(lineInfo => {
                    if (lineInfo.meterLabel) {
                        this.advancedTexture.removeControl(lineInfo.meterLabel);
                        lineInfo.meterLabel = null; // Nettoyer la référence
                    }
                });
            }

            // Met à jour les textures des lignes
            for (const lineInfo of this.lines) {
                await drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize);
                await drawFunctions.drawShapesOnporteTexture(lineInfo, this.gridSize);
            }
            updateLines();
        });


        this.gridButton.fontStyle = "normal";
        this.gridButton.color = "black";
        this.gridButton.onPointerClickObservable.add(() => {
            isGridVisible = !isGridVisible;
            this.gridButton.color = isGridVisible ? "black" : "white"; // Change la couleur du contour pour indiquer l'état

            if (this.grid) {
                this.grid.isVisible = isGridVisible;
            } else if (isGridVisible) {
                // Si la grille n'existe pas encore (au démarrage), la créer
                this.grid = BABYLON.MeshBuilder.CreateGround("grid", { width: this.gridSize, height: this.gridSize }, scene);
                this.grid.position.y = -0.1;
                this.grid.material = gridMaterial;
            }
        });
        let isGridVisible = true; // Variable pour suivre l'état de la grille (activée par défaut)

        this.grid25Button.onPointerClickObservable.add(() => {
            this.changeGridSize(25);
            updateGridSizeButtons(25);
            if (this.modePlan) {
                // this.hideNonGridElements();
            }

            // Mise à jour de la position de sizeLabel pour tous les éléments de la grille
            this.lines.forEach(lineInfo => {
                if (lineInfo.sizeLabel) {
                    this.updateLabelPosition(lineInfo);
                }
            });
        });

        this.grid50Button.onPointerClickObservable.add(() => {
            this.changeGridSize(50);
            updateGridSizeButtons(50);
            if (this.modePlan) {
                // this.hideNonGridElements();
            }

            // Mise à jour de la position de sizeLabel pour tous les éléments de la grille
            this.lines.forEach(lineInfo => {
                if (lineInfo.sizeLabel) {
                    this.updateLabelPosition(lineInfo);
                }
            });
        });

        // Crée le bouton "100" sous le bouton "50"
        this.grid100Button.onPointerClickObservable.add(() => {
            this.changeGridSize(100);
            updateGridSizeButtons(100);
            if (this.modePlan) {
                // this.hideNonGridElements();
            }

            // Mise à jour de la position de sizeLabel pour tous les éléments de la grille
            this.lines.forEach(lineInfo => {
                if (lineInfo.sizeLabel) {
                    this.updateLabelPosition(lineInfo);
                }
            });
        });

        const updateGridSizeButtons = (selectedSize) => {
            // Réinitialise les bordures des boutons
            this.grid25Button.thickness = 0;
            this.grid50Button.thickness = 0;
            this.grid100Button.thickness = 0;

            // Réinitialise la couleur des textes des boutons
            this.grid25Button.color = "white";
            this.grid50Button.color = "white";
            this.grid100Button.color = "white";

            // Définit le contour noir sur le bouton sélectionné
            if (selectedSize === 25) {
                this.grid25Button.thickness = 4;
                this.grid25Button.color = "black";
            } else if (selectedSize === 50) {
                this.grid50Button.thickness = 4;
                this.grid50Button.color = "black";
            } else if (selectedSize === 100) {
                this.grid100Button.thickness = 4;
                this.grid100Button.color = "black";
            }
        };
        updateGridSizeButtons(50); // Met à jour le contour initial (par défaut 100)

        // Boutons Droits Bas
        this.addButton.onPointerClickObservable.add(addDiscsWithLine);

        // Créer le bouton "①"
        this.numberButton.isVisible = false; // Masqué par défaut
        this.meterButton.isVisible = false; // Masqué par défaut
        this.balButton.isVisible = false; // Masqué par défaut

        // Dans le gestionnaire du bouton meterButton
        this.meterButton.onPointerClickObservable.add(() => {
            if (!this.modePlan) {
                return;
            }

            this.lineMeterDisplayed = !this.lineMeterDisplayed; // Basculer l'état d'affichage des meterLabels
            this.meterButton.color = this.lineMeterDisplayed ? "black" : "white"; // Indiquer l'état du bouton

            if (this.lineMeterDisplayed) {
                // Générer les meterLabels
                let lineMeter = 1;
                this.lines.forEach(lineInfo => {
                    // Vérifier le type de composition
                    if (["Continue", "Traits", "Points"].includes(lineInfo.currentComposition)) {
                        return; // Ne pas ajouter de meterLabel pour ces types
                    }

                    // Créer un conteneur pour meterLabel
                    const meterLabelContainer = new GUI.Rectangle(`meterLabel_${lineInfo.id}`);
                    meterLabelContainer.width = "50px";
                    meterLabelContainer.height = "30px";
                    meterLabelContainer.background = "rgba(0, 0, 0, 0)";
                    meterLabelContainer.thickness = 0;
                    this.advancedTexture.addControl(meterLabelContainer);

                    // Créer le TextBlock à l'intérieur du Rectangle
                    const meterLabelText = new GUI.TextBlock(`meterLabelText_${lineInfo.id}`, `${lineInfo.label.text} \nm`); // Ajout de "m" à la fin
                    meterLabelText.color = "black";
                    meterLabelText.fontSize = 12;
                    meterLabelText.fontStyle = "bold";
                    meterLabelText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                    meterLabelText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

                    meterLabelContainer.addControl(meterLabelText);  // Ajouter le TextBlock au Rectangle
                    this.advancedTexture.addControl(meterLabelContainer); // Ajouter le conteneur à l'interface utilisateur

                    lineInfo.meterLabel = meterLabelContainer; // Associer le conteneur au lineInfo

                    // Mettre à jour la position du label
                    this.updateMeterLabelPosition(lineInfo);

                    lineMeter++;
                });
            } else {
                // Supprimer tous les meterLabels
                this.lines.forEach(lineInfo => {
                    if (lineInfo.meterLabel) {
                        this.advancedTexture.removeControl(lineInfo.meterLabel);
                        lineInfo.meterLabel = null; // Nettoyer la référence
                    }
                });
            }
        });

        // Définir son comportement
        this.numberButton.onPointerClickObservable.add(() => {
            this.lineNumbersDisplayed = !this.lineNumbersDisplayed; // Basculer l'état d'affichage des numéros
            this.numberButton.color = this.lineNumbersDisplayed ? "black" : "white"; // Indiquer l'état du bouton

            if (this.lineNumbersDisplayed) {
                // Générer les numberLabel uniquement pour les types autorisés
                let lineNumber = 1;
                this.lines.forEach(lineInfo => {
                    // Vérifier le type de composition
                    if (["Continue", "Traits", "Points"].includes(lineInfo.currentComposition)) {
                        // Ne pas ajouter de numberLabel pour ces types
                        return;
                    }

                    // Créer un conteneur circulaire
                    const numberLabelContainer = new GUI.Rectangle(`numberLabel_${lineNumber}`);
                    numberLabelContainer.width = "30px";
                    numberLabelContainer.height = "30px";
                    numberLabelContainer.cornerRadius = 5; // Demi-largeur pour un cercle parfait
                    numberLabelContainer.color = "black"; // Couleur de la bordure
                    numberLabelContainer.background = "white";
                    numberLabelContainer.thickness = 1;
                    numberLabelContainer.isPointerBlocker = false; // Permettre aux clics de passer si nécessaire

                    // Créer le TextBlock à l'intérieur du Rectangle
                    const numberLabelText = new GUI.TextBlock(`numberLabelText_${lineNumber}`, lineNumber.toString());
                    numberLabelText.color = "black";
                    numberLabelText.fontSize = 20;
                    numberLabelText.fontStyle = "bold";
                    numberLabelText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                    numberLabelText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

                    numberLabelContainer.addControl(numberLabelText);  // Ajouter le TextBlock au Rectangle
                    this.advancedTexture.addControl(numberLabelContainer); // Ajouter le conteneur circulaire à l'interface utilisateur

                    lineInfo.numberLabel = numberLabelContainer; // Associer le conteneur au lineInfo
                    lineInfo.lineNumber = lineNumber; // Attribuer le numéro à la ligne dans les variables

                    // Mettre à jour la position du label
                    this.updateMeterLabelPosition(lineInfo);
                    this.updateNumberLabelPosition(lineInfo);
                    lineNumber++;
                });
            } else {
                // Supprimer tous les numberLabel
                this.lines.forEach(lineInfo => {
                    if (lineInfo.numberLabel) {
                        this.advancedTexture.removeControl(lineInfo.numberLabel);
                        lineInfo.numberLabel = null; // Nettoyer la référence
                    }
                });
            }
        });

        this.uButton.rotation = Math.PI / 4;
        this.uButton.onPointerClickObservable.add(() => {
            this.magnetizationEnabled = !this.magnetizationEnabled;
            this.uButton.color = this.magnetizationEnabled ? "black" : "white"; // Change la couleur pour indiquer la sélection
        });

        // Fonction pour sauvegarder la scène en JSON
        this.saveSceneToJSON = () => {
            const data = {
                gridSize: this.gridSize,
                gridVisible: this.gridVisible,
                numberVisible: this.lineNumbersDisplayed,
                meterVisible: this.lineMeterDisplayed,
                modePlan: this.modePlan,
                // Sauvegarder uniquement les disques qui ne sont pas associés à une plane
                discs: this.discs.map(disc => ({
                    id: disc.id,
                    position: disc.position.asArray(),
                    isLocked: disc.isLocked,
                    isCornerDisc: disc.isCornerDisc
                })),

                lines: this.lines.map(lineInfo => ({
                    id: lineInfo.id,
                    currentComposition: lineInfo.currentComposition,
                    startDiscId: lineInfo.startDisc.id,
                    endDiscId: lineInfo.endDisc.id,
                    isLocked: lineInfo.isLocked,
                    flipHorizontal: lineInfo.flipHorizontal,
                    flipVertical: lineInfo.flipVertical,
                    isOccultEnabled: lineInfo.isOccultEnabled,
                    potGCarreActive: lineInfo.potGCarreActive || false,
                    potGRondActive: lineInfo.potGRondActive || false,
                    potGBalActive: lineInfo.potGBalActive || false,
                    potDCarreActive: lineInfo.potDCarreActive || false,
                    potDRondActive: lineInfo.potDRondActive || false,
                    potDBalActive: lineInfo.potDBalActive || false,
                    selectedMainOption: lineInfo.selectedMainOption || {
                        Ligne: "",
                        Clôture: "",
                        Ouvrant: "",
                        Coulissant: ""
                    }
                })),
                planes: this.planes.map(planeInfo => ({
                    id: planeInfo.plane.id,
                    // Enregistrer les discIds des planes
                    discIds: planeInfo.discs.map(disc => disc.id)
                })),
                textBoxes: this.textBoxes.map(tb => ({
                    id: tb.id,
                    text: tb.text,
                    fontSize: tb.fontSize,
                    height: parseFloat(tb.height),
                    width: parseFloat(tb.width),
                    position: {
                        left: parseFloat(tb.left),
                        top: parseFloat(tb.top)
                    },
                    rotation: parseFloat(tb.rotation)
                }))
            };
            return JSON.stringify(data);
        };

        // loadSceneFromJSON
        this.loadSceneFromJSON = async (jsonData) => {
            const data = JSON.parse(jsonData);

            // 1. Supprimer toutes les zones de texte
            this.textBoxes.forEach(textBox => {
                this.advancedTexture.removeControl(textBox);
            });
            this.textBoxes = [];

            // 2. Supprimer toutes les lignes
            this.lines.forEach(lineInfo => {
                if (lineInfo.fineLine) lineInfo.fineLine.dispose();
                if (lineInfo.clotureLine) lineInfo.clotureLine.dispose();
                if (lineInfo.clotureTexture) lineInfo.clotureTexture.dispose();
                if (lineInfo.clotureMaterial) lineInfo.clotureMaterial.dispose();
                if (lineInfo.porteLine) lineInfo.porteLine.dispose();
                if (lineInfo.porteTexture) lineInfo.porteTexture.dispose();
                if (lineInfo.porteMaterial) lineInfo.porteMaterial.dispose();
                if (lineInfo.label) this.advancedTexture.removeControl(lineInfo.label);
                if (lineInfo.sizeLabel) this.advancedTexture.removeControl(lineInfo.sizeLabel);
                if (lineInfo.numberLabel) this.advancedTexture.removeControl(lineInfo.numberLabel);
                if (lineInfo.meterLabel) this.advancedTexture.removeControl(lineInfo.meterLabel);
            });
            this.lines = [];

            // 3. Supprimer tous les planes et leurs disques associés
            this.planes.forEach(planeInfo => {
                planeInfo.discs.forEach(disc => {
                    disc.dispose();
                });

                // Supprimer planeMaterial si il existe
                if (planeInfo.planeMaterial) {
                    planeInfo.planeMaterial.dispose();
                }

                planeInfo.plane.dispose();
            });
            this.planes = [];

            // 4. Supprimer tous les disques globaux
            this.discs.forEach(disc => {
                disc.dispose();
            });
            this.discs = [];

            // 5. Réassigner les propriétés sauvegardées
            this.gridSize = data.gridSize;
            this.gridVisible = data.gridVisible;
            this.lineNumbersDisplayed = data.numberVisible;
            this.lineMeterDisplayed = data.meterVisible;
            this.modePlan = data.modePlan;

            // 6. Créer une carte pour retrouver les disques par leur id
            const discMap = {};

            // 7. Recréer les disques (exclure ceux des planes)
            data.discs.forEach(discData => {
                const position = BABYLON.Vector3.FromArray(discData.position);
                const disc = addDiscAtPosition(position);
                disc.id = discData.id;
                disc.isLocked = discData.isLocked;
                disc.isCornerDisc = discData.isCornerDisc;
                disc.material = disc.isLocked ? this.lockedDiscMaterial : this.defaultDiscMaterial;
                // this.discs.push(disc); // Ajouter uniquement les disques globaux
                discMap[disc.id] = disc;
            });

            // 8. Recréer les lignes
            for (const lineData of data.lines) {
                const startDisc = discMap[lineData.startDiscId];
                const endDisc = discMap[lineData.endDiscId];
                if (!startDisc || !endDisc) {
                    console.warn(`Disque de départ ou d'arrivée manquant pour la ligne ID: ${lineData.id}`);
                    continue; // Passer à la ligne suivante si les disques ne sont pas trouvés
                }

                const lines = CreateLine("line", [startDisc.position, endDisc.position], scene);
                const lineInfo = {
                    id: lineData.id,
                    fineLine: lines.fineLine,
                    isLocked: lineData.isLocked,
                    endDisc: endDisc,
                    startDisc: startDisc,
                    clotureLine: lines.clotureLine,
                    clotureTexture: lines.clotureTexture,
                    clotureMaterial: lines.clotureMaterial,
                    porteLine: lines.porteLine,
                    porteTexture: lines.porteTexture,
                    porteMaterial: lines.porteMaterial,
                    currentComposition: lineData.currentComposition, // Composition réelle
                    flipHorizontal: lineData.flipHorizontal || false, // Restaurer flipHorizontal
                    flipVertical: lineData.flipVertical || false,     // Restaurer flipVertical
                    isOccultEnabled: lineData.isOccultEnabled || false,  // Restaurer isOccultEnabled
                    potGCarreActive: lineData.potGCarreActive || false,
                    potGRondActive: lineData.potGRondActive || false,
                    potGBalActive: lineData.potGBalActive || false,
                    potDCarreActive: lineData.potDCarreActive || false,
                    potDRondActive: lineData.potDRondActive || false,
                    potDBalActive: lineData.potDBalActive || false,
                    // Initialiser selectedMainOption si ce n'est pas déjà fait
                    selectedMainOption: lineData.selectedMainOption || {
                        Ligne: "",
                        Clôture: "",
                        Ouvrant: "",
                        Coulissant: ""
                    }
                };

                this.lines.push(lineInfo);
                addLabelForLine(lineInfo);
                await drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize);
                await drawFunctions.drawShapesOnporteTexture(lineInfo, this.gridSize);

                // Initialiser l'Action Manager si non déjà fait
                if (!lines.clotureLine.actionManager) {
                    lines.clotureLine.actionManager = new BABYLON.ActionManager(scene);
                }
                if (!lines.porteLine.actionManager) {
                    lines.porteLine.actionManager = new BABYLON.ActionManager(scene);
                }

                // Configurer le menu contextuel pour cette ligne spécifique
                try {
                    lines.clotureLine.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
                        BABYLON.ActionManager.OnRightPickTrigger,
                        (evt) => {
                            showCompositionContextMenu(lineInfo, evt); // Passer le lineInfo spécifique et l'événement
                        }
                    ));
                } catch (error) {
                    console.error(`Erreur lors de l'enregistrement de l'action contextuelle pour la ligne ID: ${lineInfo.id}`, error);
                }
            }

            // 9. Recréer les textBoxes JSON
            data.textBoxes.forEach(tbData => {
                // Utiliser createTextBox pour garantir la logique initiale
                const textBox = this.createTextBox(tbData.text, tbData.fontSize);
                textBox.id = tbData.id;
                textBox.height = `${tbData.height}px`;
                textBox.width = `${tbData.width}px`;

                // Calculer les positions (absolues)
                const left = parseFloat(tbData.position.left);
                const top = parseFloat(tbData.position.top);
                textBox.left = `${left}px`;
                textBox.top = `${top}px`;
                textBox.rotation = parseFloat(tbData.rotation);

                // Calculer gridX et gridY basés sur les positions et la taille de la grille
                const gridStep = 100 / this.gridSize;
                textBox.gridX = Math.round(left / gridStep);
                textBox.gridY = Math.round(top / gridStep);

                // Réaffecter explicitement le texte et s'assurer que le style est correct
                textBox.text = tbData.text;
                textBox.fontSize = tbData.fontSize;  // ou la valeur recalculée
                textBox.color = "black";

                // Réattacher le clic droit (si createTextBox ne le fait pas déjà)
                textBox.onPointerDownObservable.add((evt) => {
                    if (evt.buttonIndex === 2) { // Clic droit
                        if (this.textBoxContextMenu) {
                            this.advancedTexture.removeControl(this.textBoxContextMenu);
                            this.textBoxContextMenu = null;
                        }
                        const contextTxtMenu = new GUI.StackPanel();
                        contextTxtMenu.width = "30px";
                        contextTxtMenu.height = "60px";
                        contextTxtMenu.background = "rgba(0, 0, 0, 0)";
                        contextTxtMenu.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
                        contextTxtMenu.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
                        contextTxtMenu.isPointerBlocker = true;
                        // Positionnez ici le menu contextuel si besoin, par exemple en fonction de textBox.left et textBox.top
                        this.advancedTexture.addControl(contextTxtMenu);
                        this.textBoxContextMenu = contextTxtMenu;
                    }
                });

                // Forcer le rafraîchissement du textBox et de l'advancedTexture
                textBox.markAsDirty();
                this.advancedTexture.markAsDirty();

                // Option 1 : Forcer un update après un petit délai
                setTimeout(() => {
                    textBox.text = tbData.text;
                    textBox.markAsDirty();
                    this.advancedTexture.markAsDirty();
                }, 50);
            });

            // 10. Recréer les planes JSON
            data.planes.forEach(planeData => {
                const cornerDiscs = planeData.discIds.map(id => discMap[id]);
                const plane = BABYLON.MeshBuilder.CreatePlane("plane", { size: 15 }, scene);
                plane.id = planeData.id;
                plane.position = new BABYLON.Vector3(0, 0.01, 0);
                plane.rotation.x = Math.PI / 2;

                const planeMaterial = new BABYLON.StandardMaterial("planeMaterial", scene);
                planeMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
                planeMaterial.alpha = 0.1;
                plane.material = planeMaterial;

                plane.enableEdgesRendering();
                plane.edgesWidth = 5.0;
                plane.edgesColor = new BABYLON.Color4(0, 0, 0, 1);

                // Marquer les disques associés aux planes
                cornerDiscs.forEach(disc => {
                    disc.isPlaneDisc = true; // Marquer le disque comme appartenant à une plane
                    disc.isCornerDisc = true; // S'assurer qu'ils sont également marqués comme disques de coin
                    disc.updateCallback = (disc) => {
                        this.updatePlaneSize(disc, cornerDiscs, plane);
                    };
                });

                this.planes.push({
                    plane,
                    planeMaterial, // Assurez-vous d'inclure planeMaterial ici
                    discs: cornerDiscs
                });
                this.updatePlaneSize(null, cornerDiscs, plane); // Met à jour la taille du plan
            });

            // 11. Appliquer les paramètres de visibilité basés sur modePlan
            if (this.modePlan) {
                this.grid.isVisible = false; // Masquer la grille par défaut en mode plan
                this.gridButton.color = "white";
                this.discs.forEach(disc => {
                    disc.isVisible = false; // Masquer les disques globaux
                });

                this.lines.forEach(lineInfo => {
                    lineInfo.fineLine.isVisible = false; // Masquer les fineLines
                    lineInfo.sizeLabel.isVisible = false;
                    lineInfo.clotureLine.isVisible = true;
                    lineInfo.porteLine.isVisible = true;

                    // Mettre à jour la visibilité des labels
                    if (this.lineNumbersDisplayed && lineInfo.numberLabel) {
                        lineInfo.numberLabel.isVisible = true;
                    } else if (lineInfo.numberLabel) {
                        lineInfo.numberLabel.isVisible = false;
                    }

                    if (this.lineMeterDisplayed && lineInfo.meterLabel) {
                        lineInfo.meterLabel.isVisible = true;
                    } else if (lineInfo.meterLabel) {
                        lineInfo.meterLabel.isVisible = false;
                    }
                });

                // Masquer tous les boutons normaux
                this.guiElements.forEach(element => {
                    element.isVisible = false; // Masquer ces boutons
                });

                // Afficher les boutons number et meter en fonction de leur état
                this.numberButton.isVisible = this.lineNumbersDisplayed;
                this.meterButton.isVisible = this.lineMeterDisplayed;
            } else {
                // Restaurer la visibilité des disques globaux
                this.discs.forEach(disc => {
                    disc.isVisible = true;
                });

                this.lines.forEach(lineInfo => {
                    lineInfo.fineLine.isVisible = true; // Rendre les fineLines visibles
                    lineInfo.sizeLabel.isVisible = true;
                    lineInfo.clotureLine.isVisible = false;
                    lineInfo.porteLine.isVisible = false;

                    // Mettre à jour la visibilité des labels
                    if (this.lineNumbersDisplayed && lineInfo.numberLabel) {
                        lineInfo.numberLabel.isVisible = true;
                    } else if (lineInfo.numberLabel) {
                        lineInfo.numberLabel.isVisible = false;
                    }

                    if (this.lineMeterDisplayed && lineInfo.meterLabel) {
                        lineInfo.meterLabel.isVisible = true;
                    } else if (lineInfo.meterLabel) {
                        lineInfo.meterLabel.isVisible = false;
                    }
                });

                if (this.gridVisible) { // Correction de la variable ici
                    this.grid.isVisible = true;
                    this.gridButton.color = "black";
                }

                // Afficher tous les boutons normaux
                this.guiElements.forEach(element => {
                    element.isVisible = true; // Afficher ces boutons
                });

                // // Masquer les boutons number et meter en mode normal
                // this.numberButton.isVisible = false;
                // this.meterButton.isVisible = false;

            }

            // 12. Mettre à jour les textures des lignes
            for (const lineInfo of this.lines) {
                await drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize);
                await drawFunctions.drawShapesOnporteTexture(lineInfo, this.gridSize);
            }

            // 13. Appliquer les paramètres supplémentaires si nécessaire
            this.updateAllGUIElements();

            console.log("Chargement de la scène à partir du JSON terminé.");
        };

        this.changeGridSize = (newSize) => {
            if (newSize === this.gridSize) {
                console.warn(`La taille de la grille est déjà ${newSize}. Aucun changement effectué.`);
                return;
            }

            // Mettre à jour la taille de la grille
            this.gridSize = newSize;

            // Supprimer l'ancienne grille
            if (this.grid) {
                this.grid.dispose();
            }

            // Créer une nouvelle grille
            this.grid = BABYLON.MeshBuilder.CreateGround("grid", { width: this.gridSize, height: this.gridSize }, scene);
            this.grid.position.y = -0.1;
            this.grid.material = gridMaterial;
            this.grid.isVisible = this.gridVisible;

            // Ajuster la taille des disques
            const discScaleFactor = newSize / 100; // Facteur proportionnel : 25 -> 0.25, 50 -> 0.5, 100 -> 1
            this.discs.forEach(disc => {
                disc.scaling = new BABYLON.Vector3(discScaleFactor, discScaleFactor, discScaleFactor);
            });

            // Ajuster la taille et la position des textBoxes
            this.textBoxes.forEach(textBox => {
                // Taille de la police selon la grille
                let newFontSize = 20 * (100 / newSize); // 100 -> 40px, 50 -> 80px, 25 -> 160px
                textBox.fontSize = newFontSize;

                // Recalculer les positions basées sur gridX et gridY
                const newLeft = textBox.gridX * (100 / newSize);
                const newTop = textBox.gridY * (100 / newSize);
                textBox.left = `${newLeft}px`;
                textBox.top = `${newTop}px`;

                // Ajuster la hauteur et la largeur du texte
                textBox.height = `${newFontSize + 20}px`;
                textBox.width = `${textBox.text.length * newFontSize * 0.8}px`;
            });

            // Mettre à jour la caméra
            this.updateCameraOrthoParams(engine.getRenderWidth(), engine.getRenderHeight());

            // Mettre à jour les lignes et autres éléments
            updateLines();
            this.updateAllGUIElements();
            scene.render();
        };

        this.planeButton.onPointerClickObservable.add(() => {
            const plane = BABYLON.MeshBuilder.CreatePlane("plane", { size: 15 }, scene);
            plane.position = new BABYLON.Vector3(0, 0.01, 0);
            plane.rotation.x = Math.PI / 2;

            // Ajoute la transparence et le contour noir
            const planeMaterial = new BABYLON.StandardMaterial("planeMaterial", scene);
            planeMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
            planeMaterial.alpha = 0.1;
            plane.material = planeMaterial;

            // Activer le rendu des contours
            plane.enableEdgesRendering();
            plane.edgesWidth = 5.0;
            plane.edgesColor = new BABYLON.Color4(0, 0, 0, 1);

            // Position initiale des disques aux coins du plan
            const corners = [
                new BABYLON.Vector3(-7.5, 0, -7.5),
                new BABYLON.Vector3(7.5, 0, -7.5),
                new BABYLON.Vector3(-7.5, 0, 7.5),
                new BABYLON.Vector3(7.5, 0, 7.5)
            ];

            const cornerDiscs = corners.map(corner => {
                const disc = addDiscAtPosition(corner, (disc) => {
                    this.updatePlaneSize(disc, cornerDiscs, plane);
                });
                disc.isCornerDisc = true; // Marquer les disques de coin

                // Ajouter le menu contextuel pour les disques de coin
                disc.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnRightPickTrigger, (evt) => {
                    showDiscContextMenu(disc);
                }));

                return disc;
            });

            this.planes.push({ plane, discs: cornerDiscs });
            this.updatePlaneSize(null, cornerDiscs, plane); // Met à jour la taille du plan
            this.pushHistory("add plane");
        });

        this.hButton.onPointerClickObservable.add(() => {
            snapToHorizontal = !snapToHorizontal;
            this.hButton.color = snapToHorizontal ? "black" : "white"; // Change la couleur de la bordure pour indiquer la sélection
        });

        this.vButton.onPointerClickObservable.add(() => {
            snapToVertical = !snapToVertical;
            this.vButton.color = snapToVertical ? "black" : "white"; // Change la couleur de la bordure pour indiquer la sélection
        });

        // Crée le bouton TEXT
        this.textButton.onPointerClickObservable.add(() => {
            this.createTextBox();
        });

        this.balButton.onPointerClickObservable.add(() => {
            // Création du bal (taille = 5 m par défaut)
            const bal = BABYLON.MeshBuilder.CreatePlane("bal", { height: 0.2, width: 0.45 }, scene);
            bal.position = new BABYLON.Vector3(0, 0.01, 0);
            bal.rotation.x = Math.PI / 2;
            bal.isLocked = false;

            // Ajout d'un gestionnaire d'actions pour le bal
            bal.actionManager = new BABYLON.ActionManager(scene);

            // --- Gestion du clic gauche pour déplacer le bal (drag & drop) ---
            let isDragging = false;
            let dragOffset = BABYLON.Vector3.Zero();
            bal.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickDownTrigger, (evt) => {
                // On ne lance le déplacement que si le bal n'est pas verrouillé
                if (evt.sourceEvent.button === 0 && !bal.isLocked) {
                    isDragging = true;
                    // Calcul du décalage entre la position actuelle du bal et le point cliqué
                    const pickResult = scene.pick(scene.pointerX, scene.pointerY);
                    if (pickResult.hit) {
                        dragOffset = bal.position.subtract(pickResult.pickedPoint);
                    }
                }
            }));
            scene.onPointerObservable.add((pointerInfo) => {
                if (isDragging && pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
                    const pickResult = scene.pick(scene.pointerX, scene.pointerY);
                    if (pickResult.hit) {
                        bal.position = pickResult.pickedPoint.add(dragOffset);
                        bal.position.y = 0.01;
                    }
                }
                if (isDragging && pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
                    isDragging = false;
                    // ➕ ADD:
                    this.pushHistory("move bal"); // ✅ un snapshot à la fin du drag du bal
                }
            });

            // Création du menu contextuel
            const contextBalMenu = new GUI.StackPanel("contextBalMenu");
            contextBalMenu.width = "30px";
            contextBalMenu.height = "120px";
            contextBalMenu.background = "rgba(50,50,50,0.8)";
            contextBalMenu.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            contextBalMenu.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;

            // --- Gestion du clic droit pour afficher le menu contextuel ---
            bal.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnRightPickTrigger, (evt) => {
                evt.sourceEvent.preventDefault();

                // Supprimer le menu contextuel existant s'il existe
                if (window.contextBalMenu) {
                    this.advancedTexture.removeControl(window.contextBalMenu);
                    window.contextBalMenu = null;
                }


                // Positionnement du menu près du bal (conversion de la position en coordonnées écran)
                const screenPosition = BABYLON.Vector3.Project(
                    bal.position,
                    BABYLON.Matrix.Identity(),
                    scene.getTransformMatrix(),
                    this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
                );
                contextBalMenu.left = `${screenPosition.x + 10}px`;
                contextBalMenu.top = `${screenPosition.y - 50}px`;

                // Bouton "T" pour modifier la taille (en cm, valeurs par défaut 45 x 20)
                const sizeBalButton = GUI.Button.CreateSimpleButton("sizeBal", "T");
                sizeBalButton.width = "30px";
                sizeBalButton.height = "30px";
                sizeBalButton.color = "white";
                sizeBalButton.cornerRadius = 5;
                sizeBalButton.background = "green";
                sizeBalButton.onPointerClickObservable.add(() => {
                    if (bal.isLocked) return; // Ne rien faire si le bal est verrouillé
                    // Fermer le menu contextuel
                    contextBalMenu.isVisible = false;
                    // Création d'un popup pour modifier la taille du bal (en cm)
                    const sizePopup = new GUI.StackPanel("balSizePopup");
                    sizePopup.width = "52px";
                    sizePopup.height = "90px";
                    sizePopup.background = "rgba(100,100,100,0.9)";
                    sizePopup.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                    sizePopup.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

                    // Champ pour la largeur (en cm), valeur par défaut : 45
                    const widthInput = new GUI.InputText();
                    widthInput.width = "50px";
                    widthInput.height = "30px";
                    widthInput.placeholderText = "Larg. (cm)";
                    widthInput.text = "45";
                    widthInput.color = "white";
                    widthInput.background = "blue";
                    sizePopup.addControl(widthInput);

                    // Champ pour la profondeur (en cm), valeur par défaut : 20
                    const depthInput = new GUI.InputText();
                    depthInput.width = "50px";
                    depthInput.height = "30px";
                    depthInput.placeholderText = "Prof. (cm)";
                    depthInput.text = "20";
                    depthInput.color = "white";
                    depthInput.background = "blue";
                    sizePopup.addControl(depthInput);

                    // Bouton de confirmation
                    const confirmButton = GUI.Button.CreateSimpleButton("confirmSize", "ok");
                    confirmButton.width = "80px";
                    confirmButton.height = "30px";
                    confirmButton.color = "white";
                    confirmButton.background = "green";
                    confirmButton.onPointerClickObservable.add(() => {
                        const newWidth_cm = parseFloat(widthInput.text);
                        const newDepth_cm = parseFloat(depthInput.text);
                        if (!isNaN(newWidth_cm) && newWidth_cm > 0 && !isNaN(newDepth_cm) && newDepth_cm > 0) {
                            // Conversion des valeurs de cm en m
                            const newWidth_m = newWidth_cm / 100;
                            const newDepth_m = newDepth_cm / 100;
                            // La taille initiale du bal est 5 m ; on ajuste le scaling en fonction du nouveau format (en m)
                            bal.scaling.x = newWidth_m / 5;
                            bal.scaling.z = newDepth_m / 5;
                        }
                        this.advancedTexture.removeControl(sizePopup);
                    });
                    sizePopup.addControl(confirmButton);
                    this.advancedTexture.addControl(sizePopup);
                });
                contextBalMenu.addControl(sizeBalButton);

                // Bouton "Supprimer" qui supprime le bal
                const delBalButton = GUI.Button.CreateSimpleButton("delBal", "-");
                delBalButton.width = "30px";
                delBalButton.height = "30px";
                delBalButton.color = "white";
                delBalButton.cornerRadius = 5;
                delBalButton.background = "red";
                delBalButton.onPointerClickObservable.add(() => {
                    bal.dispose();
                    contextBalMenu.isVisible = false;
                    this.advancedTexture.removeControl(contextBalMenu);
                });
                contextBalMenu.addControl(delBalButton);

                // Bouton "Rotation" qui fait tourner le bal de 10° à chaque clic
                const rotBalButton = GUI.Button.CreateSimpleButton("rotBalButton", "↻");
                rotBalButton.width = "30px";
                rotBalButton.height = "30px";
                rotBalButton.color = "white";
                rotBalButton.cornerRadius = 5;
                rotBalButton.background = "blue";
                rotBalButton.onPointerClickObservable.add(() => {
                    if (bal.isLocked) return; // Aucune rotation si le bal est verrouillé
                    // Rotation de 10° en radians (10° = Math.PI/18)
                    bal.rotation.y += Math.PI / 18;
                });
                contextBalMenu.addControl(rotBalButton);

                // Bouton "Lock" qui verrouille ou déverrouille le bal
                const lockBalButton = GUI.Button.CreateSimpleButton("lockBalButton", "☼");
                lockBalButton.width = "30px";
                lockBalButton.height = "30px";
                lockBalButton.color = "white";
                lockBalButton.fontSize = "30px";
                lockBalButton.cornerRadius = 5;
                lockBalButton.fontStyle = "bold";
                // La couleur initiale est verte si le bal est déverrouillé, rouge s'il est verrouillé
                lockBalButton.background = bal.isLocked ? "red" : "green";
                lockBalButton.onPointerClickObservable.add(() => {
                    // Bascule de l'état de verrouillage
                    bal.isLocked = !bal.isLocked;
                    lockBalButton.background = bal.isLocked ? "red" : "green";
                });
                contextBalMenu.addControl(lockBalButton);

                // Ajout du menu contextuel à l'interface GUI
                this.advancedTexture.addControl(contextBalMenu);
                window.contextBalMenu = contextBalMenu;
            }));

            // --- Fermeture automatique des menus lors d'un clic gauche extérieur ---
            this.advancedTexture.onPointerDownObservable.add((evt) => {
                if (evt && evt.event && evt.event.button === 0 && window.contextBalMenu) {
                    this.advancedTexture.removeControl(window.contextBalMenu);
                    window.contextBalMenu = null;
                }
            });
        });

        // Fonction pour créer une zone de texte avec gestion d'historique propre
        this.createTextBox = (initialText = "Texte", initialFontSize = 20) => {
            const charWidth = 0.8; // facteur moyen
            const textBox = new GUI.InputText();

            // Taille de police en fonction de la grille
            const fontSize = initialFontSize * (100 / this.gridSize);

            textBox.text = initialText;
            const textLength = textBox.text.length;
            textBox.id = BABYLON.Tools.RandomId();
            textBox.width = `${textLength * fontSize * charWidth}px`;
            textBox.height = `${fontSize + 20}px`;
            textBox.color = "black";
            textBox.fontStyle = "bold";
            textBox.background = "transparent";
            textBox.placeholderColor = "gray";
            textBox.focusedBackground = "white";
            textBox.thickness = 0;
            textBox.fontSize = fontSize;
            textBox.resizeToFit = false;

            // Position logique (au centre)
            textBox.gridX = 0;
            textBox.gridY = 0;
            textBox.left = `${textBox.gridX * (100 / this.gridSize)}px`;
            textBox.top = `${textBox.gridY * (100 / this.gridSize)}px`;

            // Ajout à la scène GUI
            this.textBoxes.push(textBox);
            this.advancedTexture.addControl(textBox);

            // --------- DRAG ----------
            let isDragging = false;
            let startX = 0;
            let startY = 0;

            textBox.onPointerDownObservable.add((evt) => {
                if (evt.buttonIndex === 0) { // clic gauche => init drag
                    isDragging = true;
                    this._textDragInfo.active = true;
                    this._textDragInfo.moved = false;
                    startX = evt.x - parseFloat(textBox.left);
                    startY = evt.y - parseFloat(textBox.top);
                    textBox.background = "black";
                }
                // (clic droit : pas d'historique ici)
            });

            textBox.onPointerMoveObservable.add((evt) => {
                if (!isDragging) return;
                const newLeft = evt.x - startX;
                const newTop = evt.y - startY;

                // Ne marque moved que si un vrai déplacement a lieu (évite les snapshots vides)
                const prevLeft = parseFloat(textBox.left);
                const prevTop = parseFloat(textBox.top);
                if (Math.abs(newLeft - prevLeft) > 0.5 || Math.abs(newTop - prevTop) > 0.5) {
                    this._textDragInfo.moved = true;
                }

                textBox.left = `${newLeft}px`;
                textBox.top = `${newTop}px`;

                // Maj des positions logiques
                const scalingFactor = this.gridSize / 100;
                textBox.gridX = Math.round(newLeft * scalingFactor);
                textBox.gridY = Math.round(newTop * scalingFactor);
            });

            textBox.onPointerUpObservable.add((evt) => {
                if (isDragging) {
                    isDragging = false;
                    textBox.background = "transparent";
                }
                // Snapshot uniquement si un drag était actif ET qu'il y a eu mouvement
                if (this._textDragInfo.active) {
                    if (this._textDragInfo.moved) this.pushHistory("move text box");
                    this._textDragInfo.active = false;
                    this._textDragInfo.moved = false;
                }

                // Clic droit => ouvrir menu contextuel (sans snapshot)
                if (evt.buttonIndex === 2) {
                    if (this.textBoxContextMenu) {
                        this.advancedTexture.removeControl(this.textBoxContextMenu);
                        this.textBoxContextMenu = null;
                    }

                    const contextTxtMenu = new GUI.StackPanel();
                    contextTxtMenu.width = "30px";
                    contextTxtMenu.height = "90px";
                    contextTxtMenu.background = "rgba(0, 0, 0, 0)";
                    contextTxtMenu.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
                    contextTxtMenu.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
                    contextTxtMenu.isPointerBlocker = true;

                    // Bouton taille (T)
                    const sizeTextButton = GUI.Button.CreateSimpleButton("sizeTextButton", "T");
                    sizeTextButton.width = "30px";
                    sizeTextButton.height = "30px";
                    sizeTextButton.color = "white";
                    sizeTextButton.cornerRadius = 5;
                    sizeTextButton.background = "green";
                    contextTxtMenu.addControl(sizeTextButton);

                    // Bouton suppression (-)
                    const txtDelButton = GUI.Button.CreateSimpleButton("txtDelButton", "-");
                    txtDelButton.width = "30px";
                    txtDelButton.height = "30px";
                    txtDelButton.color = "white";
                    txtDelButton.cornerRadius = 5;
                    txtDelButton.background = "red";
                    contextTxtMenu.addControl(txtDelButton);

                    // Bouton rotation (↻)
                    const txtRotButton = GUI.Button.CreateSimpleButton("txtRotButton", "↻");
                    txtRotButton.width = "30px";
                    txtRotButton.height = "30px";
                    txtRotButton.color = "white";
                    txtRotButton.cornerRadius = 5;
                    txtRotButton.background = "blue";
                    contextTxtMenu.addControl(txtRotButton);

                    // Position du menu près de la textbox
                    const textBoxX = parseFloat(textBox.left.replace('px', ''));
                    const textBoxY = parseFloat(textBox.top.replace('px', ''));
                    const canvas = document.getElementById("renderCanvas");
                    const ecranLarg = canvas.width / 2;
                    const ecranHaut = canvas.height / 2;
                    contextTxtMenu.left = `${textBoxX + ecranLarg + 50}px`;
                    contextTxtMenu.top = `${textBoxY + ecranHaut - 30}px`;

                    this.advancedTexture.addControl(contextTxtMenu);
                    this.textBoxContextMenu = contextTxtMenu;

                    // Actions menu
                    sizeTextButton.onPointerClickObservable.add(() => {
                        const newSizeInput = prompt("Entrez la nouvelle taille de police :", textBox.fontSize);
                        if (newSizeInput !== null) {
                            const policeSize = parseFloat(newSizeInput);
                            if (!isNaN(policeSize) && policeSize > 0) {
                                textBox.fontSize = policeSize;
                                const tl = textBox.text.length || 1;
                                textBox.width = `${policeSize * (tl / 1.4)}px`;
                                textBox.height = `${policeSize * 1}px`;
                                this.pushHistory("change text box size");
                            } else {
                                alert("Veuillez entrer une taille valide.");
                            }
                        }
                        this.advancedTexture.removeControl(contextTxtMenu);
                        this.textBoxContextMenu = null;
                    });

                    txtDelButton.onPointerClickObservable.add(() => {
                        this.advancedTexture.removeControl(textBox);
                        this.textBoxes = this.textBoxes.filter(tb => tb !== textBox);
                        this.advancedTexture.removeControl(contextTxtMenu);
                        this.textBoxContextMenu = null;
                        this.pushHistory("delete text box");
                    });

                    txtRotButton.onPointerClickObservable.add(() => {
                        textBox.rotation = (textBox.rotation + Math.PI / 2) % (2 * Math.PI);
                        this.pushHistory("rotate text box");
                    });
                }
            });

            // --------- ÉDITION DE TEXTE (snapshot au commit) ----------
            // Mémorise le texte initial à l'entrée en édition
            textBox._initialTextForHistory = textBox.text;
            textBox.onFocusObservable.add(() => {
                textBox._initialTextForHistory = textBox.text;
            });

            // Si l’utilisateur sort du champ et que le contenu a changé => snapshot
            textBox.onBlurObservable.add(() => {
                if (textBox.text !== textBox._initialTextForHistory) {
                    this.pushHistory("edit text box");
                }
            });

            // Valider par Enter => retire le focus (déclenchera le blur ci‑dessus)
            textBox.onKeyboardEventProcessedObservable.add((kb) => {
                if (kb && kb.key === "Enter") {
                    // force blur en retirant le focus
                    textBox.isFocused = false;
                }
            });

            // Ajuste la boîte pendant la frappe (pas d'historique ici)
            textBox.onTextChangedObservable.add(() => {
                const taillePolice = parseInt(textBox.fontSize);
                if (!isNaN(taillePolice) && taillePolice > 0) {
                    textBox.height = `${taillePolice + 20}px`;
                    textBox.width = `${(textBox.text.length || 1) * taillePolice * charWidth}px`;
                }
            });

            // Snapshot à la création (une seule fois)
            this.pushHistory("create text box");

            return textBox;
        };

        // Dans showCompositionContextMenu 
        const showCompositionContextMenu = (lineInfo, evt) => {
            // --- Helpers 3e menu pour "Rond" ---
            let currentThirdMenu = null;

            const closeThirdMenu = () => {
                if (currentThirdMenu) {
                    advancedTexture.removeControl(currentThirdMenu);
                    const idx = openMenus.indexOf(currentThirdMenu);
                    if (idx >= 0) openMenus.splice(idx, 1);
                    currentThirdMenu = null;
                }
            };

            // --- Ouvre le menu contextuel pour la composition ---
            const openRondThirdMenu = () => {
                closeThirdMenu();
                if (typeof lineInfo.rondValeur !== "number") lineInfo.rondValeur = 250;

                const third = new GUI.StackPanel("BlocMenuRond");
                third.width = "100px";                  // menu réduit à 100px
                third.isVertical = true;
                third.background = "rgba(0,0,0,0)";
                third.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
                third.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
                third.left = "420px"; // position
                third.top = "-15px";

                // --- Bouton 250 ---
                const btn250 = GUI.Button.CreateSimpleButton("rond250Btn", "250");
                btn250.width = "100%";
                btn250.height = "40px";
                btn250.color = "white";
                btn250.background = "blue";
                btn250.fontSize = 18;
                btn250.fontStyle = "bold";
                third.addControl(btn250);

                // --- Bouton 300 ---
                const btn300 = GUI.Button.CreateSimpleButton("rond300Btn", "300");
                btn300.width = "100%";
                btn300.height = "40px";
                btn300.color = "white";
                btn300.background = "blue";
                btn300.fontSize = 18;
                btn300.fontStyle = "bold";
                third.addControl(btn300);

                // --- Champ input (valeur bien centrée) ---
                const input = new GUI.InputText("rondValueInput");
                input.width = "100px";
                input.height = "40px";
                input.color = "white";
                input.background = "green";
                input.focusedBackground = "red";
                input.fontSize = 18;
                input.text = String(lineInfo.rondValeur ?? 250);
                input.maxLength = 3;
                input.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
                third.addControl(input);

                // Sync boutons -> input + modèle
                const setRondValue = (v) => {
                    const n = parseInt(v, 10);
                    if (!Number.isFinite(n)) return;
                    lineInfo.rondValeur = n;
                    input.text = String(n);
                };
                btn250.onPointerClickObservable.add(() => setRondValue(250));
                btn300.onPointerClickObservable.add(() => setRondValue(300));
                input.onBlurObservable.add(() => setRondValue(input.text));

                advancedTexture.addControl(third);
                currentThirdMenu = third;
                openMenus.push(third);
            };
            closeAllMenus();

            const contextCompoMenu = new GUI.StackPanel("BlocMenuGlobal");
            contextCompoMenu.width = "200px";
            contextCompoMenu.height = "220px";
            contextCompoMenu.background = "rgba(0, 0, 0, 0)";
            contextCompoMenu.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            contextCompoMenu.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            contextCompoMenu.left = "20px";
            contextCompoMenu.top = "35px";
            // Ajouter le menu principal
            const mainMenu = new GUI.StackPanel("BlocMenu2");
            mainMenu.isVertical = true;
            contextCompoMenu.addControl(mainMenu);

            // Liste des compositionTypes qui supportent l'option "Occultant"
            const compositionsWithOccultant = ["Rond", "Carre", "Centre", "EAS", "60/40"];

            // Variables pour gérer les sous-menus ouverts et le bouton actif
            let currentOpenSubMenuLocal = null;
            let currentActiveButtonLocal = null;

            // Fonction pour créer un sous-menu
            const createSubMenu = (label, options, isToggle = false, lineInfo) => {
                const compoButton = GUI.Button.CreateSimpleButton(`${label}compoButton`, label);
                compoButton.width = "200px";
                compoButton.height = "40px";
                compoButton.color = "white";
                compoButton.background = "blue";
                compoButton.fontSize = 18;
                compoButton.fontStyle = "bold";
                mainMenu.addControl(compoButton);

                const subMenu = new GUI.StackPanel("BlocMenu3");
                subMenu.width = "200px"; // Largeur du sous-menu
                subMenu.height = "400px"; // Hauteur suffisante pour les options
                subMenu.isVertical = true;
                subMenu.background = "rgba(0, 0, 0, 0)";
                subMenu.isVisible = false; // Masqué par défaut
                this.advancedTexture.addControl(subMenu);

                compoButton.onPointerClickObservable.add(() => {
                    // Fermer le sous-menu ouvert précédemment
                    if (currentOpenSubMenuLocal && currentOpenSubMenuLocal !== subMenu) {
                        currentOpenSubMenuLocal.isVisible = false;
                        if (currentActiveButtonLocal) {
                            currentActiveButtonLocal.background = "blue";
                        }
                    }
                    subMenu.isVisible = !subMenu.isVisible;
                    if (subMenu.isVisible) {
                        // Positionnement simple (sinon adapter en fonction de votre layout)
                        subMenu.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
                        subMenu.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
                        subMenu.left = "220px";
                        subMenu.top = "125px";
                        // subMenu.left = "-900px";
                        // subMenu.top = "60px";
                        compoButton.background = "green";
                        currentActiveButtonLocal = compoButton;
                        currentOpenSubMenuLocal = subMenu;
                        openMenus.push(subMenu);
                    } else {
                        compoButton.background = "blue";
                        currentActiveButtonLocal = null;
                        currentOpenSubMenuLocal = null;
                    }
                });

                // Gestion de la sélection unique dans le sous-menu
                let selectedSubButton = null;
                Object.keys(options).forEach(option => {
                    const subButton = GUI.Button.CreateSimpleButton(`${option}Button`, option);
                    subButton.width = "200px";
                    subButton.height = "40px";
                    subButton.color = "white";
                    subButton.background = "blue";  // couleur par défaut
                    subButton.fontSize = 18;
                    subButton.fontStyle = "bold";
                    // Si l'option correspond à celle enregistrée dans lineInfo.selectedClotureOption, on la met en surbrillance
                    if (lineInfo.selectedClotureOption === option) {
                        subButton.background = "green";
                    }
                    subMenu.addControl(subButton);

                    subButton.onPointerClickObservable.add(() => {
                        // On enregistre l'option choisie
                        lineInfo.currentComposition = option;

                        // Redessin éventuel de la texture
                        drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize);
                        drawFunctions.drawShapesOnporteTexture(lineInfo, this.gridSize);

                        // Cas spécifique : option = "Rond"
                        if (label === "Clôture" && option === "Rond") {
                            openRondThirdMenu();   // ouvre le 3e menu avec 250 / 300 + champ modifiable
                        } else {
                            closeThirdMenu();      // ferme si on clique autre chose
                        }

                        // Mets à jour les lignes (si besoin)
                        if (typeof updateLines === "function") {
                            updateLines();
                        }
                    });

                });

                return subMenu;
            };

            // Créer les sous-menus principaux
            createSubMenu("Ligne", {
                "Continue": "Continue",
                "Points": "Points",
                "Traits": "Traits",
            }, false, lineInfo);

            const clotureSubMenu = createSubMenu("Clôture", {
                "Rond": "Rond",
                "Carre": "Carre",
                "Centre": "Centre",
                "Gabion": "Gabion",
                "Module": "Module",
                "EAS": "EAS",
                "60/40": "60/40"
            }, false, lineInfo);

            // Bouton "Occultant" dans Clôture
            const occultantButton = GUI.Button.CreateSimpleButton("OccultantButton", "Occultant");
            occultantButton.width = "200px";
            occultantButton.height = "40px";
            occultantButton.color = "white";
            occultantButton.fontSize = 18;
            occultantButton.fontStyle = "bold";
            occultantButton.background = "orange";
            occultantButton.isVisible = compositionsWithOccultant.includes(lineInfo.currentComposition);
            clotureSubMenu.addControl(occultantButton);

            occultantButton.onPointerClickObservable.add(async () => {
                lineInfo.isOccultEnabled = !lineInfo.isOccultEnabled;
                occultantButton.background = lineInfo.isOccultEnabled ? "darkorange" : "orange";
                await drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize);
                updateLines();
            });

            const updateOccultantButtonVisibility = () => {
                const isSupported = compositionsWithOccultant.includes(lineInfo.currentComposition);
                occultantButton.isVisible = isSupported;
                if (!isSupported && lineInfo.isOccultEnabled) {
                    lineInfo.isOccultEnabled = false;
                    occultantButton.background = "orange";
                    drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize);
                    updateLines();
                }
            };

            // Créer le sous-menu "Ouvrant" et en conserver la référence
            const ouvrantSubMenu = createSubMenu("Ouvrant", {
                "Simple-Battant": "Simple-Battant",
                "Double-Battant": "Double-Battant"
            }, false, lineInfo);

            // Conteneur de la section Poteaux
            const poteauxContainer = new GUI.StackPanel("BlocMenuPot");
            poteauxContainer.width = "200px";
            poteauxContainer.isVertical = true;
            poteauxContainer.paddingTop = "0px";
            ouvrantSubMenu.addControl(poteauxContainer);

            // Container horizontal pour 2 colonnes
            const poteauxButtonContainer = new GUI.StackPanel("BlocMenu5");
            poteauxButtonContainer.width = "200px";
            poteauxButtonContainer.height = "125px"; // Pour 4 boutons x 40px
            poteauxButtonContainer.background = "red";
            poteauxButtonContainer.isVertical = false;
            poteauxContainer.addControl(poteauxButtonContainer);

            // Colonne Gauche
            const columnBoutonPotGauche = new GUI.StackPanel("BlocMenu6");
            columnBoutonPotGauche.width = "100px";
            columnBoutonPotGauche.isVertical = true;
            poteauxButtonContainer.addControl(columnBoutonPotGauche);

            const boutonPotGauche = new GUI.StackPanel("BlocMenu7");
            boutonPotGauche.width = "100px";
            boutonPotGauche.isVertical = true;
            columnBoutonPotGauche.addControl(boutonPotGauche);

            // Colonne Droit
            const columnBoutonsPotDroit = new GUI.StackPanel("BlocMenu8");
            columnBoutonsPotDroit.width = "100px";
            columnBoutonsPotDroit.isVertical = true;
            poteauxButtonContainer.addControl(columnBoutonsPotDroit);

            const boutonPotDroit = new GUI.StackPanel("BlocMenu9");
            boutonPotDroit.width = "100px";
            boutonPotDroit.isVertical = true;
            columnBoutonsPotDroit.addControl(boutonPotDroit);

            // Variables de sélection unique pour chaque colonne
            let selectedBoutonGauche = null;
            let selectedBoutonDroit = null;

            const createBoutonPoteaux = (name, text, parentContainer, isGauche = true) => {
                const btn = GUI.Button.CreateSimpleButton(name, text);
                btn.width = "100px";
                btn.height = "30px";
                btn.color = "white";
                btn.background = "purple"; // couleur par défaut
                btn.fontSize = 16;
                btn.fontStyle = "bold";
                parentContainer.addControl(btn);

                // À la création, si l'option correspond à une sélection déjà faite, on change la couleur
                if (isGauche) {
                    if ((text === "Carré" && lineInfo.potGCarreActive) ||
                        (text === "Rond" && lineInfo.potGRondActive) ||
                        (text === "BaL" && lineInfo.potGBalActive)) {
                        btn.background = "green";
                    }
                } else {
                    if ((text === "Carré" && lineInfo.potDCarreActive) ||
                        (text === "Rond" && lineInfo.potDRondActive) ||
                        (text === "BaL" && lineInfo.potDBalActive)) {
                        btn.background = "green";
                    }
                }

                btn.onPointerClickObservable.add(() => {
                    // Réinitialiser les sélections pour le groupe (colonne gauche ou droite)
                    if (isGauche) {
                        // Mettre à false toutes les options de la colonne gauche
                        lineInfo.potGCarreActive = false;
                        lineInfo.potGRondActive = false;
                        lineInfo.potGBalActive = false;
                        // Mettre à jour l'état visuel pour tous les boutons de ce conteneur si nécessaire
                        if (text === "Carré") {
                            lineInfo.potGCarreActive = true;
                        } else if (text === "Rond") {
                            lineInfo.potGRondActive = true;
                        } else if (text === "BaL") {
                            lineInfo.potGBalActive = true;
                        }
                    } else {
                        lineInfo.potDCarreActive = false;
                        lineInfo.potDRondActive = false;
                        lineInfo.potDBalActive = false;
                        if (text === "Carré") {
                            lineInfo.potDCarreActive = true;
                        } else if (text === "Rond") {
                            lineInfo.potDRondActive = true;
                        } else if (text === "BaL") {
                            lineInfo.potDBalActive = true;
                        }
                    }

                    // Mettre à jour le background de tous les boutons enfants dans parentContainer pour refléter l'état
                    parentContainer.children.forEach(child => {
                        if (child instanceof GUI.Button) {
                            child.background = "purple"; // couleur par défaut
                        }
                    });
                    // Puis mettre la couleur "green" sur le bouton cliqué
                    btn.background = "green";

                    // Mise à jour de la texture porte si nécessaire
                    drawFunctions.drawShapesOnporteTexture(lineInfo, this.gridSize).then(() => {
                        lineInfo.porteTexture.update();
                        updateLines(); // si vous avez une telle fonction
                    });
                });

                return btn;
            };

            // Créer 4 boutons pour la colonne Gauche
            createBoutonPoteaux("potBtn1", "X", boutonPotGauche, true); // Ce bouton peut servir d'indicateur général ou ne pas activer d'indicateur particulier
            createBoutonPoteaux("potBtn2", "Carré", boutonPotGauche, true);
            createBoutonPoteaux("potBtn3", "Rond", boutonPotGauche, true);
            createBoutonPoteaux("potBtn4", "BaL", boutonPotGauche, true);

            // Créer 4 boutons pour la colonne Droit
            createBoutonPoteaux("potBtn5", "X", boutonPotDroit, false); // Ce bouton peut servir d'indicateur général ou ne pas activer d'indicateur particulier
            createBoutonPoteaux("potBtn6", "Carré", boutonPotDroit, false);
            createBoutonPoteaux("potBtn7", "Rond", boutonPotDroit, false);
            createBoutonPoteaux("potBtn8", "BaL", boutonPotDroit, false);

            // Créer le sous-menu "Coulissant"
            createSubMenu("Coulissant", {
                "Aluette STD Aut.": "Aluette STD Aut.",
                "Terminus STD Aut.": "Terminus STD Aut.",
                "Aluette BaL Aut.": "Aluette BaL Aut.",
                "Terminus BaL Aut.": "Terminus BaL Aut.",
                "Taurus_rail": "Taurus_rail",
                "Taurus_T2": "Taurus_T2",
                "Taurus_Aut.": "Taurus_Aut.",
                "Taurus_T2-Jungle": "Taurus_T2-Jungle"
            }, false, lineInfo);

            // Boutons "H" et "V"
            const flipButtonPanel = new GUI.StackPanel("BlocMenu10");
            flipButtonPanel.isVertical = false;
            flipButtonPanel.width = "200px";
            flipButtonPanel.height = "40px";
            flipButtonPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
            flipButtonPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            flipButtonPanel.paddingTop = "0px";

            const flipHorizontalButton = GUI.Button.CreateSimpleButton("H", "↔");
            flipHorizontalButton.width = "100px";
            flipHorizontalButton.height = "40px";
            flipHorizontalButton.color = "white";
            flipHorizontalButton.background = "purple";
            flipHorizontalButton.fontSize = 30;
            flipHorizontalButton.fontStyle = "bold";
            flipHorizontalButton.onPointerClickObservable.add(() => {
                lineInfo.flipHorizontal = !lineInfo.flipHorizontal;
                drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize);
                drawFunctions.drawShapesOnporteTexture(lineInfo, this.gridSize);
                updateLines();
            });

            const flipVerticalButton = GUI.Button.CreateSimpleButton("V", "↕");
            flipVerticalButton.width = "100px";
            flipVerticalButton.height = "40px";
            flipVerticalButton.color = "white";
            flipVerticalButton.background = "purple";
            flipVerticalButton.fontSize = 26;
            flipVerticalButton.fontStyle = "bold";
            flipVerticalButton.onPointerClickObservable.add(() => {
                lineInfo.flipVertical = !lineInfo.flipVertical;
                drawFunctions.drawShapesOnclotureTexture(lineInfo, this.gridSize);
                drawFunctions.drawShapesOnporteTexture(lineInfo, this.gridSize);
                updateLines();
            });

            flipButtonPanel.addControl(flipHorizontalButton);
            flipButtonPanel.addControl(flipVerticalButton);
            mainMenu.addControl(flipButtonPanel);

            // Ajouter le menu à l'interface utilisateur
            this.advancedTexture.addControl(contextCompoMenu);
            this.compoContextMenu = contextCompoMenu;
            openMenus.push(contextCompoMenu);
        };

        // window.addEventListener("DOMContentLoaded", () => {
        //     const canvas = document.getElementById("renderCanvas");
        //     const engine = new BABYLON.Engine(canvas, true);
        //     const scene = new BABYLON.Scene(engine);
        //     // Empêcher le menu contextuel par défaut
        //     canvas.addEventListener('contextmenu', (e) => {
        //         e.preventDefault();
        //     });

        //     this.createScene(canvas, null, null);
        // });

        // Fonction pour appliquer une composition spécifique
        const applyComposition = async (lineInfo, compositionType) => {
            lineInfo.currentComposition = compositionType;
            await drawFunctions.drawShapesOnclotureTexture(lineInfo);
        };
        // Boucle de rendu de la scène
        engine.runRenderLoop(() => {
            scene.render();
        });

        // Redimensionne l'engin lors de la redimension de la fenêtre
        window.addEventListener("resize", () => {
            engine.resize();
            this.updateCameraOrthoParams(engine.getRenderWidth(), engine.getRenderHeight());
            this.updateAllGUIElements();
        });

        this.engine = engine;
        this.scene = scene;

    }
    isDiscMovable(disc) {
        return !disc.isLocked;
    };

    downloadJSON(jsonData, filename) {
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // Ajout de l'extension ".json" si nécessaire
        a.download = filename.endsWith(".json") ? filename : filename + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    uploadJSON(callback) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const jsonData = e.target.result;
                callback(jsonData);
            };
            reader.readAsText(file);
        };
        input.click();
    };

    updateCameraOrthoParams(width, height) {
        const aspectRatio = width / height;
        const gridHalfSize = this.gridSize / 2;
        if (aspectRatio >= 1) {
            // Écran plus large que haut
            this.camera.orthoLeft = -gridHalfSize * aspectRatio;
            this.camera.orthoRight = gridHalfSize * aspectRatio;
            this.camera.orthoTop = gridHalfSize;
            this.camera.orthoBottom = -gridHalfSize;
        } else {
            // Écran plus haut que large
            this.camera.orthoLeft = -gridHalfSize;
            this.camera.orthoRight = gridHalfSize;
            this.camera.orthoTop = gridHalfSize / aspectRatio;
            this.camera.orthoBottom = -gridHalfSize / aspectRatio;
        }

        // Recentrer la caméra sur la scène
        this.camera.position = new BABYLON.Vector3(0, 50, 0); // Ajustez y et z selon vos besoins
        this.camera.setTarget(new BABYLON.Vector3(0, 0, 0));
        this.camera.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);
    }

    updatePlaneSize(draggedDisc, cornerDiscs, plane) {
        const [disc1, disc2, disc3, disc4] = cornerDiscs;

        // Ajuste les autres disques en fonction du disque déplacé
        if (draggedDisc === disc1) {
            disc2.position.z = disc1.position.z;
            disc3.position.x = disc1.position.x;
        } else if (draggedDisc === disc2) {
            disc1.position.z = disc2.position.z;
            disc4.position.x = disc2.position.x;
        } else if (draggedDisc === disc3) {
            disc1.position.x = disc3.position.x;
            disc4.position.z = disc3.position.z;
        } else if (draggedDisc === disc4) {
            disc2.position.x = disc4.position.x;
            disc3.position.z = disc4.position.z;
        }

        // Calcule la nouvelle largeur et hauteur en fonction des positions des disques
        const newWidth = Math.abs(disc1.position.x - disc2.position.x);
        const newHeight = Math.abs(disc1.position.z - disc3.position.z);

        // Met à jour l'échelle du plan
        plane.scaling.x = newWidth / 15;
        plane.scaling.y = newHeight / 15;

        // Met à jour la position du plan
        plane.position.x = (disc1.position.x + disc2.position.x) / 2;
        plane.position.z = (disc1.position.z + disc3.position.z) / 2;

        // S'assurer que y = 0 pour le plan
        plane.position.y = 0;

        // Met à jour les positions des disques pour rester attachés à leurs coins
        disc1.position.x = plane.position.x - newWidth / 2;
        disc1.position.z = plane.position.z - newHeight / 2;
        disc1.position.y = 0.1; // y = 0

        disc2.position.x = plane.position.x + newWidth / 2;
        disc2.position.z = plane.position.z - newHeight / 2;
        disc2.position.y = 0.1; // y = 0

        disc3.position.x = plane.position.x - newWidth / 2;
        disc3.position.z = plane.position.z + newHeight / 2;
        disc3.position.y = 0.1; // y = 0

        disc4.position.x = plane.position.x + newWidth / 2;
        disc4.position.z = plane.position.z + newHeight / 2;
        disc4.position.y = 0.1; // y = 0

        // Met à jour les matériaux des disques de coin en fonction de leur état
        cornerDiscs.forEach(cornerDisc => {
            if (cornerDisc.isSelected && !cornerDisc.isLocked) {
                cornerDisc.material = this.selectedDiscMaterial;
            } else if (cornerDisc.isLocked) {
                cornerDisc.material = this.lockedDiscMaterial;
            } else {
                cornerDisc.material = this.defaultDiscMaterial;
            }
        });
    }

    // Fonction pour mettre à jour les positions de tous les éléments GUI lors du redimensionnement
    updateAllGUIElements() {
        this.lines.forEach(lineInfo => {
            this.updateLabelPosition(lineInfo);
        });

        // Met à jour les positions des menus contextuels s'ils sont ouverts
        if (this.discContextMenu && this.currentDisc) {
            const screenPosition = BABYLON.Vector3.Project(
                this.currentDisc.position,
                BABYLON.Matrix.Identity(),
                this.scene.getTransformMatrix(),
                this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
            );

            this.discContextMenu.left = `${screenPosition.x + 5}px`;
            this.discContextMenu.top = `${screenPosition.y - 100}px`;
        }

        if (this.labelContextMenu && this.currentLineInfo) {
            const screenPosition = BABYLON.Vector3.Project(
                this.currentLineInfo.fineLine.getBoundingInfo().boundingBox.centerWorld,
                BABYLON.Matrix.Identity(),
                this.scene.getTransformMatrix(),
                this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
            );

            this.labelContextMenu.left = `${screenPosition.x + 5}px`;
            this.labelContextMenu.top = `${screenPosition.y - 60}px`;
        }

        // Met à jour les positions des zones de texte
        this.textBoxes.forEach(textBox => {
            const newLeft = textBox.gridX * (100 / this.gridSize);
            const newTop = textBox.gridY * (100 / this.gridSize);
            textBox.left = `${newLeft}px`;
            textBox.top = `${newTop}px`;
        });
    };
    // Fonction mise à jour pour positionner meterLabel
    updateMeterLabelPosition(lineInfo) {
        if (lineInfo.meterLabel) {
            const midPoint = lineInfo.startDisc.position.add(lineInfo.endDisc.position).scale(0.5);
            const lineVector = lineInfo.endDisc.position.subtract(lineInfo.startDisc.position);
            const perpendicularVector = new BABYLON.Vector3(lineVector.z, 0, -lineVector.x).normalize();
            const offsetDistance = lineInfo.isOccultEnabled ? 0.035 * this.gridSize : 0.026 * this.gridSize;
            const finalPosition = midPoint.add(perpendicularVector.scale(offsetDistance));
            const screenPosition = BABYLON.Vector3.Project(
                finalPosition,
                BABYLON.Matrix.Identity(),
                this.scene.getTransformMatrix(),
                this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
            );

            // Appliquer les positions absolues basées sur les coordonnées écran
            lineInfo.meterLabel.left = `${screenPosition.x - this.engine.getRenderWidth() / 2}px`;
            lineInfo.meterLabel.top = `${screenPosition.y - this.engine.getRenderHeight() / 2}px`;
            lineInfo.meterLabel.rotation = 0;
        }
    }

    // Fonction mise à jour pour positionner numberLabel
    updateNumberLabelPosition(lineInfo) {
        if (lineInfo.numberLabel) {
            const midPoint = lineInfo.startDisc.position.add(lineInfo.endDisc.position).scale(0.5);
            const lineVector = lineInfo.endDisc.position.subtract(lineInfo.startDisc.position);
            const perpendicularVector = new BABYLON.Vector3(-lineVector.z, 0, lineVector.x).normalize();
            const offsetDistance = 0.035 * this.gridSize;
            const finalPosition = midPoint.add(perpendicularVector.scale(offsetDistance));
            const screenPosition = BABYLON.Vector3.Project(
                finalPosition,
                BABYLON.Matrix.Identity(),
                this.scene.getTransformMatrix(),
                this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
            );

            // Appliquer les positions absolues basées sur les coordonnées écran
            lineInfo.numberLabel.left = `${screenPosition.x - this.engine.getRenderWidth() / 2}px`;
            lineInfo.numberLabel.top = `${screenPosition.y - this.engine.getRenderHeight() / 2}px`;
            lineInfo.numberLabel.rotation = 0;
        }
    }

    // Met à jour la position de l'étiquette
    updateLabelPosition(lineInfo) {
        const midPoint = lineInfo.startDisc.position.add(lineInfo.endDisc.position).scale(0.5);
        const length = BABYLON.Vector3.Distance(lineInfo.startDisc.position, lineInfo.endDisc.position);
        lineInfo.label.text = `${length.toFixed(2)}`; // Mise à jour de l'étiquette de longueur

        const screenPosition = BABYLON.Vector3.Project(
            midPoint,
            BABYLON.Matrix.Identity(),
            this.scene.getTransformMatrix(),
            this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
        );

        // Babylon.js GUI positions sont centrées par défaut, donc ajuster en conséquence
        lineInfo.sizeLabel.left = `${screenPosition.x - this.engine.getRenderWidth() / 2}px`;
        lineInfo.sizeLabel.top = `${screenPosition.y - this.engine.getRenderHeight() / 2}px`;
    }

    goResize() {
        this.engine.resize();
        this.updateCameraOrthoParams(this.engine.getRenderWidth(), this.engine.getRenderHeight());
        this.updateAllGUIElements()
    }
}

window.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("renderCanvas");
    new babylon(canvas, null, null);
});
