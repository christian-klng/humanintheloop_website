/* ============================================================
   KI-Prototyp Entscheidungshilfe
   Interactive decision tree for AI prototype planning
   ============================================================ */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────
    const dhState = {};

    // ── Decision Tree Data ─────────────────────────────────
    const DECISION_TREE = [
        {
            id: 'q1_1',
            level: 1,
            question: 'Gibt es bereits eine Software am Markt, die deinen Anwendungsfall abdeckt \u2013 auch wenn sie konfiguriert oder angepasst werden muss?',
            hint: 'Auch \u201eKaufen\u201c bedeutet Arbeit: Tools wie Langdock, Make oder Microsoft Power Platform m\u00fcssen konfiguriert, mit Datenquellen verbunden und auf Datenschutz gepr\u00fcft werden. \u201eKaufen\u201c spart Entwicklung, nicht Konzeption.',
            type: 'single',
            options: [
                { value: 'buy', label: 'Ja, es gibt passende Software' },
                { value: 'build', label: 'Nein, mein Anwendungsfall ist zu individuell' }
            ],
            visibleWhen: function () { return true; },
            dependsOn: []
        },
        {
            id: 'q1_2',
            level: 1,
            question: 'Ben\u00f6tigt dein Prototyp eine KI-Komponente (z.\u00a0B. Sprachverarbeitung, Bilderkennung, Textgenerierung) oder geht es um klassische Automatisierung und Datenanalyse?',
            hint: 'Nicht alles, was \u201eintelligent\u201c wirkt, braucht KI. Regelbasierte Automatisierung, Dashboards und statistische Analysen l\u00f6sen viele Probleme zuverl\u00e4ssiger und g\u00fcnstiger. KI lohnt sich vor allem, wenn unstrukturierte Daten (Freitext, Bilder, Sprache) verarbeitet werden oder Entscheidungen nicht vollst\u00e4ndig in Regeln abbildbar sind.',
            type: 'single',
            options: [
                { value: 'ai', label: 'Ja, KI ist n\u00f6tig' },
                { value: 'automation', label: 'Nein, Automatisierung/Datenanalyse reicht' }
            ],
            visibleWhen: function (s) { return s.q1_1 === 'build'; },
            dependsOn: ['q1_1'],
            footnote: 'Relevant, weil Eigenentwicklung gew\u00e4hlt wurde.'
        },
        {
            id: 'q2_1',
            level: 2,
            question: 'Werden in deinem Prototyp personenbezogene Daten verarbeitet (z.\u00a0B. Namen, E-Mail-Adressen, Gesundheitsdaten, Bewerbungen)?',
            type: 'single',
            options: [
                { value: 'yes', label: 'Ja' },
                { value: 'no', label: 'Nein' }
            ],
            visibleWhen: function (s) { return s.q1_1 !== undefined; },
            dependsOn: ['q1_1']
        },
        {
            id: 'q2_2',
            level: 2,
            question: 'Werden sensible Unternehmensdaten verarbeitet (z.\u00a0B. Gesch\u00e4ftsgeheimnisse, Finanzdaten, Strategiepapiere, Quellcode)?',
            hint: 'Bei sensiblen Firmendaten ist nicht nur das Hosting relevant, sondern auch, ob der Anbieter die Daten f\u00fcr eigenes Modelltraining nutzt. Viele Anbieter schlie\u00dfen das in Enterprise-Tarifen vertraglich aus \u2013 pr\u00fcfe das im jeweiligen DPA.',
            type: 'single',
            options: [
                { value: 'enterprise', label: 'Ja, Enterprise-Pl\u00e4ne akzeptabel' },
                { value: 'selfhost', label: 'Ja, nur eigene Infrastruktur' },
                { value: 'local', label: 'Ja, nur mein eigener Computer' },
                { value: 'no', label: 'Nein' }
            ],
            visibleWhen: function (s) { return s.q1_1 !== undefined; },
            dependsOn: ['q1_1']
        },
        {
            id: 'q2_3',
            level: 2,
            question: 'Trifft eines der folgenden Hochrisiko-Szenarien auf deinen KI-Anwendungsfall zu?',
            type: 'multi',
            options: [
                { value: 'hr_recruiting', label: 'Bewertung oder Auswahl von Bewerbern (HR / Recruiting)' },
                { value: 'hr_credit', label: 'Kreditw\u00fcrdigkeitspr\u00fcfung oder Scoring von Personen' },
                { value: 'hr_biometric', label: 'Biometrische Identifikation oder Kategorisierung von Personen' },
                { value: 'hr_safety', label: 'Sicherheitsrelevante Steuerung (Medizinprodukte, kritische Infrastruktur)' },
                { value: 'hr_education', label: 'Bildung: Bewertung von Pr\u00fcfungsleistungen oder Zugangsberechtigungen' },
                { value: 'hr_law', label: 'Strafverfolgung, Grenzkontrolle, Migration' },
                { value: 'none', label: 'Keines davon' }
            ],
            visibleWhen: function (s) { return s.q1_2 === 'ai'; },
            dependsOn: ['q1_2'],
            footnote: 'Relevant, weil KI genutzt wird.'
        },
        {
            id: 'q3_1',
            level: 3,
            question: 'Wie viele Personen sollen den Prototyp nutzen?',
            type: 'single',
            options: [
                { value: 'single', label: 'Nur ich / eine einzelne Person' },
                { value: 'multi', label: 'Mehrere Personen im Team' }
            ],
            visibleWhen: function (s) { return s.q1_1 !== undefined; },
            dependsOn: ['q1_1']
        },
        {
            id: 'q3_2',
            level: 3,
            question: 'Sollen unterschiedliche Nutzer unterschiedliche Inhalte sehen oder unterschiedliche Rechte haben?',
            type: 'single',
            options: [
                { value: 'yes', label: 'Ja, Rollenkonzept n\u00f6tig' },
                { value: 'no', label: 'Nein, alle sehen dasselbe' }
            ],
            visibleWhen: function (s) { return s.q3_1 === 'multi'; },
            dependsOn: ['q3_1'],
            footnote: 'Relevant, weil mehrere Nutzer geplant sind.'
        },
        {
            id: 'q3_3',
            level: 3,
            question: 'Auf welchen Ger\u00e4ten soll der Prototyp laufen?',
            hint: 'Eine Web-App ist der flexibelste Ansatz, wenn Mitarbeiter unterschiedliche Ger\u00e4te nutzen (Windows, Mac, Tablet). Sie erfordert aber ein gehostetes Frontend und \u2013 bei Mehrnutzern \u2013 ein Backend mit Authentifizierung.',
            type: 'single',
            options: [
                { value: 'browser', label: 'Im Browser (Web-App)' },
                { value: 'desktop', label: 'Als Desktop-Anwendung' },
                { value: 'script', label: 'Als Skript / Kommandozeile' }
            ],
            visibleWhen: function (s) { return s.q1_1 !== undefined; },
            dependsOn: ['q1_1']
        },
        {
            id: 'q4_1',
            level: 4,
            question: 'Welche Art von KI ben\u00f6tigst du?',
            type: 'multi',
            options: [
                { value: 'llm', label: 'Textverarbeitung / Sprachmodell (LLM)' },
                { value: 'vision', label: 'Bilderkennung / Computer Vision' },
                { value: 'voice', label: 'Sprachein-/ausgabe (Voice / Speech)' },
                { value: 'prediction', label: 'Strukturierte Vorhersage / Klassifikation' },
                { value: 'other', label: 'Sonstiges (z.\u00a0B. Empfehlungssystem, Zeitreihenanalyse)' }
            ],
            visibleWhen: function (s) { return s.q1_2 === 'ai'; },
            dependsOn: ['q1_2'],
            footnote: 'Relevant, weil KI genutzt wird.'
        },
        {
            id: 'q4_2',
            level: 4,
            question: 'Wie m\u00f6chtest du das KI-Modell nutzen?',
            hint: 'F\u00fcr einen Prototyp ist die API-Nutzung fast immer der beste Einstieg \u2013 schnell, g\u00fcnstig und ohne Infrastruktur-Aufwand. Selbst-Hosting und Fine-Tuning lohnen sich erst, wenn der Prototyp validiert ist und Datenschutz- oder Performance-Anforderungen es erfordern.',
            type: 'single',
            options: [
                { value: 'api', label: 'Bestehendes Modell \u00fcber API nutzen' },
                { value: 'selfhost', label: 'Bestehendes Modell selbst hosten' },
                { value: 'finetune', label: 'Fine-Tuning eines bestehenden Modells' },
                { value: 'own', label: 'Eigenes Modell trainieren' }
            ],
            visibleWhen: function (s) { return s.q1_2 === 'ai'; },
            dependsOn: ['q1_2'],
            footnote: 'Relevant, weil KI genutzt wird.'
        }
    ];

    // ── Checklist Rules ────────────────────────────────────
    var CHECKLIST_RULES = [
        {
            group: 'Projekttyp',
            entries: [
                {
                    when: function (s) { return s.q1_1 === 'buy'; },
                    icon: '\u2705',
                    text: 'Bestehende Software nutzen \u2013 Fokus liegt auf Anbieterauswahl, Konfiguration und Integration statt Eigenentwicklung.'
                },
                {
                    when: function (s) { return s.q1_1 === 'build' && s.q1_2 === 'ai'; },
                    icon: '\u2705',
                    text: 'Eigenentwicklung mit KI-Komponente \u2013 Der Anwendungsfall ist zu individuell f\u00fcr Standardsoftware. Es wird ein eigener Prototyp mit KI gebaut.'
                },
                {
                    when: function (s) { return s.q1_1 === 'build' && s.q1_2 === 'automation'; },
                    icon: '\u2705',
                    text: 'Klassische Automatisierung / Datenanalyse \u2013 Kein KI-Modell n\u00f6tig. Fokus auf Datenfl\u00fcsse, Regeln und Auswertungen (z.\u00a0B. mit Python-Skripten, BI-Tools oder Workflow-Engines wie n8n).'
                }
            ]
        },
        {
            group: 'Datenschutz & Compliance',
            entries: [
                {
                    when: function (s) { return s.q2_1 === 'yes'; },
                    icon: '\u2705',
                    text: 'Personenbezogene Daten \u2013 DSGVO-Anforderungen beachten: EU-Hosting bevorzugen, AVV mit Anbietern abschlie\u00dfen, US-Anbieter nur mit gepr\u00fcftem DPA. Datenschutz-Folgenabsch\u00e4tzung pr\u00fcfen.'
                },
                {
                    when: function (s) { return s.q2_1 === 'no'; },
                    icon: '\u2705',
                    text: 'Keine personenbezogenen Daten \u2013 Keine besonderen DSGVO-Anforderungen f\u00fcr den Prototyp.'
                },
                {
                    when: function (s) { return s.q2_2 === 'enterprise'; },
                    icon: '\u2705',
                    text: 'Sensible Firmendaten \u2013 Enterprise-Anbieter mit vertraglichem Trainingsausschluss und DPA erforderlich.'
                },
                {
                    when: function (s) { return s.q2_2 === 'selfhost'; },
                    icon: '\u2705',
                    text: 'Sensible Firmendaten \u2013 Self-Hosting auf eigenen/gemieteten Servern. Open-Source-Modelle und -Tools bevorzugen.'
                },
                {
                    when: function (s) { return s.q2_2 === 'local'; },
                    icon: '\u2705',
                    text: 'Sensible Firmendaten \u2013 Vollst\u00e4ndig lokale Verarbeitung ohne Netzwerkzugriff. Nur lokale Software und Modelle.'
                },
                {
                    when: function (s) { return s.q2_2 === 'no'; },
                    icon: '\u2705',
                    text: 'Keine sensiblen Firmendaten \u2013 Keine besonderen Hosting-Einschr\u00e4nkungen.'
                },
                {
                    when: function (s) { return isHighRisk(s); },
                    icon: '\u26a0\ufe0f',
                    text: 'M\u00f6gliche Hochrisiko-KI \u2013 Der Anwendungsfall ber\u00fchrt Bereiche des AI Act. Empfehlung: KI als Unterst\u00fctzungssystem gestalten, nicht als autonomen Entscheider. Juristische Beratung einholen.'
                },
                {
                    when: function (s) { return s.q2_3 && !isHighRisk(s); },
                    icon: '\u2705',
                    text: 'Keine Hochrisiko-KI \u2013 Der Anwendungsfall f\u00e4llt voraussichtlich nicht unter die Hochrisiko-Kategorie des AI Act.'
                }
            ]
        },
        {
            group: 'Architektur',
            entries: [
                {
                    when: function (s) { return s.q3_1 === 'single'; },
                    icon: '\u2705',
                    text: 'Einzelnutzer \u2013 Kein Server oder Datenbank zwingend n\u00f6tig. Einfache lokale L\u00f6sung m\u00f6glich (z.\u00a0B. Desktop-App, Skript, Spreadsheet).'
                },
                {
                    when: function (s) { return s.q3_1 === 'multi'; },
                    icon: '\u2705',
                    text: 'Mehrere Nutzer \u2013 Zentrale Datenhaltung auf einem Server erforderlich (z.\u00a0B. PostgreSQL, Supabase, Firebase). Backup-Strategie einplanen.'
                },
                {
                    when: function (s) { return s.q3_2 === 'yes'; },
                    icon: '\u2705',
                    text: 'Rollenkonzept \u2013 Unterschiedliche Sichtbarkeiten und Rechte pro Nutzerrolle. Authentifizierung plus Autorisierung erforderlich (z.\u00a0B. mit Keycloak, Auth0, Supabase Auth).'
                },
                {
                    when: function (s) { return s.q3_2 === 'no'; },
                    icon: '\u2705',
                    text: 'Kein Rollenkonzept \u2013 Alle Nutzer sehen denselben Inhalt. Einfache Authentifizierung reicht (z.\u00a0B. Login ohne Rollenverwaltung).'
                },
                {
                    when: function (s) { return s.q3_3 === 'browser'; },
                    icon: '\u2705',
                    text: 'Web-App \u2013 Frontend-Hosting und ggf. Backend erforderlich. Bei Mehrnutzern: Authentifizierung einplanen (z.\u00a0B. mit OAuth, Magic Links oder Passwort-Login).'
                },
                {
                    when: function (s) { return s.q3_3 === 'desktop'; },
                    icon: '\u2705',
                    text: 'Desktop-Anwendung \u2013 Lokale Installation auf den Rechnern der Nutzer. Bei Mehrnutzern: geteilte Datenbank auf Server n\u00f6tig (z.\u00a0B. Electron-App mit Remote-DB).'
                },
                {
                    when: function (s) { return s.q3_3 === 'script'; },
                    icon: '\u2705',
                    text: 'Skript / CLI \u2013 Minimaler Aufwand, kein UI. Geeignet f\u00fcr technische Nutzer und schnelle Validierung (z.\u00a0B. Python-Skript, Jupyter Notebook).'
                }
            ]
        },
        {
            group: 'KI-Umsetzung',
            entries: [
                {
                    when: function (s) { return hasMulti(s.q4_1, 'llm'); },
                    icon: '\u2705',
                    text: 'LLM / Textverarbeitung \u2013 Sprachmodell f\u00fcr Textgenerierung oder -analyse (z.\u00a0B. GPT, Claude, Llama, Mistral).'
                },
                {
                    when: function (s) { return hasMulti(s.q4_1, 'vision'); },
                    icon: '\u2705',
                    text: 'Computer Vision \u2013 Bildanalyse oder Dokumentenerkennung (z.\u00a0B. YOLO, Florence, OCR-Engines).'
                },
                {
                    when: function (s) { return hasMulti(s.q4_1, 'voice'); },
                    icon: '\u2705',
                    text: 'Sprachein-/ausgabe \u2013 Speech-to-Text oder Text-to-Speech (z.\u00a0B. Whisper, ElevenLabs, Azure Speech).'
                },
                {
                    when: function (s) { return hasMulti(s.q4_1, 'prediction'); },
                    icon: '\u2705',
                    text: 'Strukturierte Vorhersage \u2013 Vorhersagen auf Basis tabellarischer Daten (z.\u00a0B. scikit-learn, XGBoost).'
                },
                {
                    when: function (s) { return hasMulti(s.q4_1, 'other'); },
                    icon: '\u2705',
                    text: 'Sonstige KI \u2013 Empfehlungssystem, Zeitreihenanalyse, Reinforcement Learning o.\u00a0\u00c4.'
                },
                {
                    when: function (s) { return s.q4_2 === 'api'; },
                    icon: '\u2705',
                    text: 'Modell \u00fcber API \u2013 Schneller Einstieg ohne eigene Infrastruktur (z.\u00a0B. OpenAI API, Anthropic API, Google Vertex AI).'
                },
                {
                    when: function (s) { return s.q4_2 === 'selfhost'; },
                    icon: '\u2705',
                    text: 'Selbst gehostetes Modell \u2013 Open-Source-Modell auf eigener Infrastruktur (z.\u00a0B. Ollama, vLLM, Hugging Face Inference). GPU-Server einplanen.'
                },
                {
                    when: function (s) { return s.q4_2 === 'finetune'; },
                    icon: '\u2705',
                    text: 'Fine-Tuning \u2013 Bestehende Modelle mit eigenen Daten anpassen. Trainingsdaten kuratieren und Evaluierung einplanen.'
                },
                {
                    when: function (s) { return s.q4_2 === 'own'; },
                    icon: '\u2705',
                    text: 'Eigenes Modell \u2013 Training von Grund auf. Hoher Ressourcen- und Datenbedarf. Nur empfohlen bei sehr spezifischen Anforderungen.'
                },
                {
                    when: function (s) { return s.q4_2 === 'api' && (s.q2_2 === 'selfhost' || s.q2_2 === 'local'); },
                    icon: '\u26a0\ufe0f',
                    text: 'Konflikt: Du hast angegeben, dass sensible Firmendaten nicht an externe Anbieter gesendet werden d\u00fcrfen. Eine API-Nutzung ist dann nur m\u00f6glich, wenn die verarbeiteten Daten nicht sensibel sind oder der Anbieter vertragliche Garantien bietet.'
                }
            ]
        }
    ];

    // ── Helpers ────────────────────────────────────────────

    function isHighRisk(s) {
        if (!Array.isArray(s.q2_3)) return false;
        return s.q2_3.length > 0 && !(s.q2_3.length === 1 && s.q2_3[0] === 'none');
    }

    function hasMulti(arr, val) {
        return Array.isArray(arr) && arr.indexOf(val) !== -1;
    }

    // ── State Management ───────────────────────────────────

    function setAnswer(questionId, value) {
        // Toggle: if same value clicked again, deselect
        if (dhState[questionId] === value) {
            delete dhState[questionId];
        } else {
            dhState[questionId] = value;
        }
        resetDependents(questionId);
        render();
    }

    function toggleMulti(questionId, value) {
        var current = Array.isArray(dhState[questionId]) ? dhState[questionId].slice() : [];

        // "Keines davon" is exclusive
        if (value === 'none') {
            dhState[questionId] = ['none'];
        } else {
            // Remove 'none' if selecting something else
            var noneIdx = current.indexOf('none');
            if (noneIdx !== -1) current.splice(noneIdx, 1);

            var idx = current.indexOf(value);
            if (idx !== -1) {
                current.splice(idx, 1);
            } else {
                current.push(value);
            }
            dhState[questionId] = current.length > 0 ? current : undefined;
        }

        resetDependents(questionId);
        render();
    }

    function resetDependents(changedId) {
        DECISION_TREE.forEach(function (q) {
            if (q.dependsOn && q.dependsOn.indexOf(changedId) !== -1) {
                delete dhState[q.id];
                resetDependents(q.id);
            }
        });
    }

    // ── Rendering ──────────────────────────────────────────

    function render() {
        renderDecisionTree();
        renderChecklist();
    }

    function renderDecisionTree() {
        var container = document.getElementById('dh-tree');
        if (!container) return;

        // Collect visible questions
        var visibleQuestions = DECISION_TREE.filter(function (q) {
            return q.visibleWhen(dhState);
        });

        // Sequential: show answered + first unanswered only
        var firstUnansweredIdx = -1;
        for (var i = 0; i < visibleQuestions.length; i++) {
            if (dhState[visibleQuestions[i].id] === undefined) {
                firstUnansweredIdx = i;
                break;
            }
        }
        var questionsToShow = firstUnansweredIdx === -1
            ? visibleQuestions
            : visibleQuestions.slice(0, firstUnansweredIdx + 1);

        var html = '';

        questionsToShow.forEach(function (q, idx) {
            var isAnswered = dhState[q.id] !== undefined;
            var isLast = idx === questionsToShow.length - 1;

            // Should the connector's vertical line stop at this node?
            // Only if there's no next node, or the next node is at a shallower level.
            // If the next node is at the same or deeper level, the line must continue.
            var nextQ = questionsToShow[idx + 1];
            var isLastAtOwnLevel = !nextQ || nextQ.level < q.level;

            html += '<div class="dh-node' + (isLast && !isAnswered ? ' dh-node--active' : '') + '">';

            // Connector with dot
            html += '<div class="dh-connector' + (isLastAtOwnLevel ? ' dh-connector--last' : '') + '" aria-hidden="true"><span class="dh-dot"></span></div>';

            // Question card
            html += '<div class="dh-question' + (isAnswered ? ' dh-question--answered' : '') + '" data-question="' + q.id + '">';
            html += '<div class="dh-question-header">';
            html += '<h3 class="dh-question-label" id="dh-label-' + q.id + '">' + q.question + '</h3>';
            html += '</div>';

            if (q.type === 'multi') {
                html += renderMultiOptions(q);
            } else {
                html += renderSingleOptions(q);
            }

            if (q.hint) {
                html += '<div class="dh-hint">' + q.hint + '</div>';
            }

            // High-risk warning
            if (q.id === 'q2_3' && isHighRisk(dhState)) {
                html += '<div class="dh-warning-box">';
                html += '<strong>\u26a0\ufe0f Dein Anwendungsfall k\u00f6nnte als Hochrisiko-KI nach dem EU AI Act gelten.</strong><br><br>';
                html += 'Hochrisiko-KI unterliegt umfangreichen Dokumentations-, Transparenz- und \u00dcberwachungspflichten. F\u00fcr Unternehmen, deren Kerngesch\u00e4ft nicht Softwareentwicklung ist, sind diese Pflichten oft unverh\u00e4ltnism\u00e4\u00dfig aufw\u00e4ndig.<br><br>';
                html += '<strong>Gestaltungsempfehlung:</strong> Pr\u00fcfe, ob du die KI als Unterst\u00fctzungssystem statt als Entscheider einsetzen kannst. Wenn ein Mensch die finale Entscheidung trifft und die KI nur Vorschl\u00e4ge liefert, kann das die regulatorischen Anforderungen deutlich reduzieren. Lass dich hierzu juristisch beraten.';
                html += '</div>';
            }

            // API compatibility warning
            if (q.id === 'q4_2' && dhState.q4_2 === 'api' && (dhState.q2_2 === 'selfhost' || dhState.q2_2 === 'local')) {
                html += '<div class="dh-warning-box">';
                html += '<strong>\u26a0\ufe0f</strong> Du hast angegeben, dass sensible Firmendaten nicht an externe Anbieter gesendet werden d\u00fcrfen. Eine API-Nutzung ist dann nur m\u00f6glich, wenn die verarbeiteten Daten nicht sensibel sind oder der Anbieter vertragliche Garantien bietet (Enterprise-Tarif mit DPA).';
                html += '</div>';
            }

            // Footnote
            if (q.footnote) {
                html += '<div class="dh-footnote">' + q.footnote + '</div>';
            }

            html += '</div>'; // close dh-question
            html += '</div>'; // close dh-node
        });

        container.innerHTML = html;
    }

    function renderSingleOptions(q) {
        var html = '<div class="dh-options" role="radiogroup" aria-labelledby="dh-label-' + q.id + '">';
        q.options.forEach(function (opt) {
            var selected = dhState[q.id] === opt.value;
            html += '<div class="dh-option' + (selected ? ' is-selected' : '') + '"';
            html += ' role="radio" aria-checked="' + selected + '" tabindex="0"';
            html += ' data-question="' + q.id + '" data-value="' + opt.value + '" data-type="single">';
            html += opt.label;
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    function renderMultiOptions(q) {
        var current = Array.isArray(dhState[q.id]) ? dhState[q.id] : [];
        var html = '<div class="dh-multi-options" role="group" aria-labelledby="dh-label-' + q.id + '">';
        q.options.forEach(function (opt) {
            var selected = current.indexOf(opt.value) !== -1;
            html += '<div class="dh-multi-option' + (selected ? ' is-selected' : '') + '"';
            html += ' role="checkbox" aria-checked="' + selected + '" tabindex="0"';
            html += ' data-question="' + q.id + '" data-value="' + opt.value + '" data-type="multi">';
            html += '<span class="dh-multi-check" aria-hidden="true">' + (selected ? '\u2713' : '') + '</span>';
            html += '<span>' + opt.label + '</span>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    function renderChecklist() {
        var container = document.getElementById('dh-checklist');
        if (!container) return;

        var hasAny = Object.keys(dhState).length > 0;
        if (!hasAny) {
            container.innerHTML = '<h3 class="dh-checklist-title">Dein Grobkonzept</h3>' +
                '<p class="dh-checklist-empty">Beantworte die Fragen links, um dein Grobkonzept Schritt f\u00fcr Schritt aufzubauen.</p>';
            return;
        }

        var html = '<h3 class="dh-checklist-title">Dein Grobkonzept</h3>';

        CHECKLIST_RULES.forEach(function (group) {
            var activeEntries = group.entries.filter(function (e) { return e.when(dhState); });
            if (activeEntries.length === 0) return;

            html += '<div class="dh-checklist-group">';
            html += '<h4 class="dh-checklist-group-title">' + group.group + '</h4>';
            html += '<ul class="dh-checklist-list">';
            activeEntries.forEach(function (e) {
                var isWarning = e.icon === '\u26a0\ufe0f';
                html += '<li class="dh-checklist-item' + (isWarning ? ' dh-checklist-item--warning' : '') + '">';
                html += '<span>' + e.text + '</span>';
                html += '</li>';
            });
            html += '</ul>';
            html += '</div>';
        });

        container.innerHTML = html;
    }

    // ── Event Handling ─────────────────────────────────────

    function initDecisionHelper() {
        var container = document.getElementById('decision-helper');
        if (!container) return;

        container.addEventListener('click', function (e) {
            var option = e.target.closest('.dh-option, .dh-multi-option');
            if (!option) return;

            var questionId = option.dataset.question;
            var value = option.dataset.value;
            var type = option.dataset.type;

            if (type === 'multi') {
                toggleMulti(questionId, value);
            } else {
                setAnswer(questionId, value);
            }
        });

        container.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var option = e.target.closest('.dh-option, .dh-multi-option');
            if (!option) return;

            e.preventDefault();
            option.click();
        });

        render();
    }

    // ── Init ───────────────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDecisionHelper);
    } else {
        initDecisionHelper();
    }

})();
