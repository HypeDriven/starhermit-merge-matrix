/* Merge Matrix — translation tables (see lang/i18n.js).
 * Each row: [English key, es-419, de-DE, fr-FR, pt-BR, it-IT]. en-GB, es-ES and
 * fr-CA list only where they differ from en-US, es-419 and fr-FR.
 * "Merge Matrix" and "StarHermit" are names and stay as they are; tile values
 * are digits. The Graphics strings live in src/gfxtext.ts and the account
 * strings in src/sh-strings.ts; both follow the same game language.
 */
(function (root) {
  'use strict';
  var ROWS = [
    // ---- HUD, title
    ['Score', 'Puntos', 'Punkte', 'Score', 'Pontos', 'Punti'],
    ['Best', 'Récord', 'Rekord', 'Record', 'Recorde', 'Record'],
    ['Moves', 'Movimientos', 'Züge', 'Coups', 'Jogadas', 'Mosse'],
    ['Time', 'Tiempo', 'Zeit', 'Temps', 'Tempo', 'Tempo'],
    ['Pause', 'Pausa', 'Pause', 'Pause', 'Pausar', 'Pausa'],
    ['Settings', 'Configuración', 'Einstellungen', 'Paramètres', 'Configurações', 'Impostazioni'],
    ['Main menu', 'Menú principal', 'Hauptmenü', 'Menu principal', 'Menu principal', 'Menu principale'],
    ['Main', 'Principal', 'Haupt', 'Principal', 'Principal', 'Principale'],
    ['A run is in progress.', 'Hay una partida en curso.', 'Ein Lauf ist im Gange.', 'Une partie est en cours.', 'Há uma partida em andamento.', 'C’è una partita in corso.'],
    ['Resume run', 'Reanudar partida', 'Lauf fortsetzen', 'Reprendre la partie', 'Retomar partida', 'Riprendi la partita'],
    ['Play', 'Jugar', 'Spielen', 'Jouer', 'Jogar', 'Gioca'],
    ['Daily challenge', 'Desafío diario', 'Tagesherausforderung', 'Défi du jour', 'Desafio diário', 'Sfida del giorno'],
    ['Journey', 'Viaje', 'Reise', 'Voyage', 'Jornada', 'Viaggio'],
    ['Learn', 'Aprender', 'Lernen', 'Apprendre', 'Aprender', 'Impara'],
    ['How to play', 'Cómo jugar', 'Spielanleitung', 'Comment jouer', 'Como jogar', 'Come si gioca'],
    ['Guest profile', 'Perfil de invitado', 'Gastprofil', 'Profil invité', 'Perfil de convidado', 'Profilo ospite'],
    ['progress saves on this device', 'el progreso se guarda en este dispositivo', 'Fortschritt wird auf diesem Gerät gespeichert', 'la progression est enregistrée sur cet appareil', 'o progresso fica salvo neste dispositivo', 'i progressi sono salvati su questo dispositivo'],
    ['progress synced to your account', 'progreso sincronizado con tu cuenta', 'Fortschritt mit deinem Konto synchronisiert', 'progression synchronisée avec votre compte', 'progresso sincronizado com sua conta', 'progressi sincronizzati con il tuo account'],
    ['saving progress…', 'guardando el progreso…', 'Fortschritt wird gespeichert …', 'enregistrement de la progression…', 'salvando o progresso…', 'salvataggio dei progressi…'],
    ['sync offline — progress saves on this device', 'sincronización sin conexión: el progreso se guarda en este dispositivo', 'Synchronisierung offline – Fortschritt wird auf diesem Gerät gespeichert', 'synchronisation hors ligne — la progression est enregistrée sur cet appareil', 'sincronização offline — o progresso fica salvo neste dispositivo', 'sincronizzazione offline: i progressi sono salvati su questo dispositivo'],
    ['Player', 'Jugador', 'Spieler', 'Joueur', 'Jogador', 'Giocatore'],
    ['Player {id}', 'Jugador {id}', 'Spieler {id}', 'Joueur {id}', 'Jogador {id}', 'Giocatore {id}'],
    ['{done}/40 stages', '{done}/40 etapas', '{done}/40 Etappen', '{done}/40 étapes', '{done}/40 etapas', '{done}/40 tappe'],

    // ---- modes
    ['Choose a mode', 'Elige un modo', 'Wähle einen Modus', 'Choisissez un mode', 'Escolha um modo', 'Scegli una modalità'],
    ['Practice', 'Práctica', 'Übung', 'Entraînement', 'Prática', 'Pratica'],
    ['Unranked. Pick a goal, undo allowed, restart freely.', 'Sin clasificación. Elige una meta, se puede deshacer y reiniciar libremente.', 'Ohne Wertung. Ziel wählen, Rückgängig erlaubt, jederzeit neu starten.', 'Non classé. Choisissez un objectif, annulation permise, recommencez à volonté.', 'Sem ranking. Escolha uma meta, desfazer permitido, reinicie à vontade.', 'Senza classifica. Scegli un obiettivo, annulla consentito, ricomincia quando vuoi.'],
    ['Challenge', 'Desafío', 'Herausforderung', 'Défi', 'Desafio', 'Sfida'],
    ['Move-limited runs. Beat the goal inside the budget.', 'Partidas con movimientos limitados. Alcanza la meta dentro del límite.', 'Läufe mit Zuglimit. Erreiche das Ziel im Rahmen des Budgets.', 'Parties à coups limités. Atteignez l’objectif dans le budget.', 'Partidas com jogadas limitadas. Alcance a meta dentro do limite.', 'Partite a mosse limitate. Raggiungi l’obiettivo entro il budget.'],
    ['Score chase', 'Caza de puntos', 'Punktejagd', 'Course au score', 'Caça aos pontos', 'Caccia al punteggio'],
    ['Seeded board, no undo. Compare on the leaderboard.', 'Tablero con semilla fija, sin deshacer. Compárate en la clasificación.', 'Brett mit festem Seed, ohne Rückgängig. Vergleiche dich in der Bestenliste.', 'Plateau à graine fixe, sans annulation. Comparez-vous au classement.', 'Tabuleiro com semente fixa, sem desfazer. Compare no ranking.', 'Tabellone a seme fisso, senza annulla. Confrontati in classifica.'],
    ['Setup', 'Preparación', 'Einrichtung', 'Préparation', 'Preparação', 'Impostazione'],
    ['Goal tile', 'Bloque meta', 'Zielblock', 'Tuile objectif', 'Bloco meta', 'Blocco obiettivo'],
    ['512 — quick', '512 — rápido', '512 – schnell', '512 — rapide', '512 — rápido', '512 — veloce'],
    ['1024 — standard', '1024 — estándar', '1024 – Standard', '1024 — standard', '1024 — padrão', '1024 — standard'],
    ['2048 — classic', '2048 — clásico', '2048 – klassisch', '2048 — classique', '2048 — clássico', '2048 — classico'],
    ['4096 — deep', '4096 — profundo', '4096 – tief', '4096 — profond', '4096 — profundo', '4096 — profondo'],
    ['Board', 'Tablero', 'Brett', 'Plateau', 'Tabuleiro', 'Tabellone'],
    ['3 × 3 — tight', '3 × 3 — estrecho', '3 × 3 – eng', '3 × 3 — serré', '3 × 3 — apertado', '3 × 3 — stretto'],
    ['5 × 5 — wide', '5 × 5 — amplio', '5 × 5 – weit', '5 × 5 — large', '5 × 5 — amplo', '5 × 5 — ampio'],
    ['Move limit — reach 512 in 60 moves', 'Límite de movimientos: llega a 512 en 60 movimientos', 'Zuglimit – erreiche 512 in 60 Zügen', 'Coups limités — atteignez 512 en 60 coups', 'Limite de jogadas — chegue a 512 em 60 jogadas', 'Mosse limitate: arriva a 512 in 60 mosse'],
    ['Move limit — reach 1024 in 100 moves', 'Límite de movimientos: llega a 1024 en 100 movimientos', 'Zuglimit – erreiche 1024 in 100 Zügen', 'Coups limités — atteignez 1024 en 100 coups', 'Limite de jogadas — chegue a 1024 em 100 jogadas', 'Mosse limitate: arriva a 1024 in 100 mosse'],
    ['Speed — reach 256 within 2 minutes', 'Velocidad: llega a 256 en 2 minutos', 'Tempo – erreiche 256 in 2 Minuten', 'Vitesse — atteignez 256 en 2 minutes', 'Velocidade — chegue a 256 em 2 minutos', 'Velocità: arriva a 256 entro 2 minuti'],
    ['Wide matrix — reach 2048 on 5 × 5', 'Matriz amplia: llega a 2048 en 5 × 5', 'Weite Matrix – erreiche 2048 auf 5 × 5', 'Matrice large — atteignez 2048 en 5 × 5', 'Matriz ampla — chegue a 2048 em 5 × 5', 'Matrice ampia: arriva a 2048 su 5 × 5'],
    ['Start', 'Empezar', 'Starten', 'Commencer', 'Começar', 'Inizia'],
    ['Back', 'Atrás', 'Zurück', 'Retour', 'Voltar', 'Indietro'],
    ['Unranked · undo allowed · about 5–15 minutes · solo.', 'Sin clasificación · se puede deshacer · unos 5–15 minutos · individual.', 'Ohne Wertung · Rückgängig erlaubt · etwa 5–15 Minuten · allein.', 'Non classé · annulation permise · environ 5 à 15 minutes · en solo.', 'Sem ranking · desfazer permitido · cerca de 5–15 minutos · solo.', 'Senza classifica · annulla consentito · circa 5–15 minuti · in solitaria.'],
    ['Unranked · constrained goal · undo allowed except speed · solo.', 'Sin clasificación · meta con restricciones · se puede deshacer salvo en velocidad · individual.', 'Ohne Wertung · Ziel mit Auflagen · Rückgängig erlaubt außer bei Tempo · allein.', 'Non classé · objectif contraint · annulation permise sauf en vitesse · en solo.', 'Sem ranking · meta com restrições · desfazer permitido exceto na velocidade · solo.', 'Senza classifica · obiettivo vincolato · annulla consentito tranne in velocità · in solitaria.'],
    ['Ranked · shared seed · no undo · one board per difficulty.', 'Clasificatoria · semilla compartida · sin deshacer · un tablero por dificultad.', 'Gewertet · gemeinsamer Seed · ohne Rückgängig · ein Brett pro Schwierigkeit.', 'Classé · graine partagée · sans annulation · un plateau par difficulté.', 'Ranqueada · semente compartilhada · sem desfazer · um tabuleiro por dificuldade.', 'In classifica · seme condiviso · senza annulla · un tabellone per difficoltà.'],
    ['Signed in, this result is posted to the high-score leaderboard.', 'Con la sesión iniciada, este resultado se envía a la clasificación de récords.', 'Angemeldet wird dieses Ergebnis an die Highscore-Bestenliste gesendet.', 'Connecté, ce résultat est envoyé au classement des meilleurs scores.', 'Com login, este resultado vai para o ranking de recordes.', 'Con l’accesso, questo risultato va nella classifica dei record.'],
    ['This run does not affect competitive rating.', 'Esta partida no afecta a la clasificación competitiva.', 'Dieser Lauf zählt nicht für die Wertung.', 'Cette partie n’affecte pas le classement compétitif.', 'Esta partida não afeta a classificação competitiva.', 'Questa partita non influisce sulla classifica competitiva.'],

    // ---- journey, learn
    ['Forty stages. Each band teaches one idea, combines it, then tests mastery every 8th stage.', 'Cuarenta etapas. Cada tramo enseña una idea, la combina y pone a prueba la maestría cada 8 etapas.', 'Vierzig Etappen. Jeder Abschnitt lehrt eine Idee, kombiniert sie und prüft die Meisterschaft jede 8. Etappe.', 'Quarante étapes. Chaque palier enseigne une idée, la combine, puis teste la maîtrise toutes les 8 étapes.', 'Quarenta etapas. Cada faixa ensina uma ideia, combina e testa a maestria a cada 8 etapas.', 'Quaranta tappe. Ogni fascia insegna un’idea, la combina e mette alla prova la maestria ogni 8 tappe.'],
    ['Stage {n}', 'Etapa {n}', 'Etappe {n}', 'Étape {n}', 'Etapa {n}', 'Tappa {n}'],
    ['Mastery {n}', 'Maestría {n}', 'Meisterschaft {n}', 'Maîtrise {n}', 'Maestria {n}', 'Maestria {n}'],
    ['goal {n}', 'meta {n}', 'Ziel {n}', 'objectif {n}', 'meta {n}', 'obiettivo {n}'],
    ['{n} moves max', 'máx. {n} movimientos', 'max. {n} Züge', '{n} coups max.', 'máx. {n} jogadas', 'max {n} mosse'],
    ['theme {name}', 'tema {name}', 'Design {name}', 'thème {name}', 'tema {name}', 'tema {name}'],
    ['completed', 'completada', 'abgeschlossen', 'terminée', 'concluída', 'completata'],
    ['not completed', 'sin completar', 'nicht abgeschlossen', 'non terminée', 'não concluída', 'non completata'],
    ['Slide the matrix', 'Desliza la matriz', 'Verschiebe die Matrix', 'Faites glisser la matrice', 'Deslize a matriz', 'Fai scorrere la matrice'],
    ['Use arrow keys, WASD, or swipe to slide every block. Blocks move as far as they can. Make 3 moves to continue.', 'Usa las flechas, WASD o desliza el dedo para mover todos los bloques. Los bloques avanzan todo lo posible. Haz 3 movimientos para continuar.', 'Verschiebe alle Blöcke mit Pfeiltasten, WASD oder Wischen. Blöcke rutschen so weit wie möglich. Mach 3 Züge, um weiterzukommen.', 'Utilisez les flèches, WASD ou un balayage pour faire glisser tous les blocs. Ils vont aussi loin que possible. Jouez 3 coups pour continuer.', 'Use as setas, WASD ou deslize para mover todos os blocos. Eles vão o mais longe possível. Faça 3 jogadas para continuar.', 'Usa le frecce, WASD o scorri per spostare tutti i blocchi. I blocchi avanzano il più possibile. Fai 3 mosse per continuare.'],
    ['Merge equals', 'Une iguales', 'Gleiche verschmelzen', 'Fusionnez les égaux', 'Junte iguais', 'Unisci gli uguali'],
    ['When two blocks with the same number collide, they combine into one worth twice as much — and you score the new value. Make 4 moves and merge at least once.', 'Cuando dos bloques con el mismo número chocan, se combinan en uno que vale el doble, y sumas el nuevo valor. Haz 4 movimientos y une al menos una vez.', 'Stoßen zwei Blöcke mit gleicher Zahl zusammen, verschmelzen sie zu einem mit doppeltem Wert – und du bekommst den neuen Wert als Punkte. Mach 4 Züge und verschmelze mindestens einmal.', 'Quand deux blocs de même nombre se rencontrent, ils fusionnent en un bloc qui vaut le double — et vous marquez la nouvelle valeur. Jouez 4 coups et fusionnez au moins une fois.', 'Quando dois blocos com o mesmo número se encontram, viram um só que vale o dobro — e você marca o novo valor. Faça 4 jogadas e junte pelo menos uma vez.', 'Quando due blocchi con lo stesso numero si scontrano, si uniscono in uno che vale il doppio e guadagni il nuovo valore. Fai 4 mosse e unisci almeno una volta.'],
    ['Mind the empty cells', 'Cuida las celdas vacías', 'Achte auf freie Felder', 'Surveillez les cases vides', 'Cuidado com as casas vazias', 'Attento alle celle vuote'],
    ['After every move a new block appears. If the matrix fills with no merges left, the run ends. Reach a 32 tile to finish training.', 'Tras cada movimiento aparece un bloque nuevo. Si la matriz se llena sin uniones posibles, la partida termina. Llega a un bloque de 32 para terminar el entrenamiento.', 'Nach jedem Zug erscheint ein neuer Block. Ist die Matrix voll und nichts kann mehr verschmelzen, endet der Lauf. Erreiche einen 32er-Block, um das Training abzuschließen.', 'Après chaque coup, un nouveau bloc apparaît. Si la matrice se remplit sans fusion possible, la partie se termine. Atteignez une tuile 32 pour finir l’entraînement.', 'Depois de cada jogada surge um bloco novo. Se a matriz enche sem junções possíveis, a partida acaba. Chegue a um bloco 32 para concluir o treino.', 'Dopo ogni mossa compare un nuovo blocco. Se la matrice si riempie senza unioni possibili, la partita finisce. Arriva a un blocco da 32 per finire l’allenamento.'],

    // ---- play
    ['Objective', 'Objetivo', 'Ziel', 'Objectif', 'Objetivo', 'Obiettivo'],
    ['Reach the goal tile.', 'Alcanza el bloque meta.', 'Erreiche den Zielblock.', 'Atteignez la tuile objectif.', 'Alcance o bloco meta.', 'Raggiungi il blocco obiettivo.'],
    ['Reach a {n} block.', 'Alcanza un bloque de {n}.', 'Erreiche einen {n}er-Block.', 'Atteignez un bloc {n}.', 'Alcance um bloco {n}.', 'Raggiungi un blocco da {n}.'],
    ['Moves left: {n}.', 'Movimientos restantes: {n}.', 'Verbleibende Züge: {n}.', 'Coups restants : {n}.', 'Jogadas restantes: {n}.', 'Mosse rimaste: {n}.'],
    ['Time limit {n}s.', 'Límite de tiempo {n} s.', 'Zeitlimit {n} s.', 'Limite de temps {n} s.', 'Limite de tempo {n} s.', 'Limite di tempo {n} s.'],
    ['Largest block: {max} · {n} legal directions', 'Bloque mayor: {max} · {n} direcciones válidas', 'Größter Block: {max} · {n} mögliche Richtungen', 'Plus grand bloc : {max} · {n} directions possibles', 'Maior bloco: {max} · {n} direções válidas', 'Blocco più grande: {max} · {n} direzioni valide'],
    ['Merge Matrix board', 'Tablero de Merge Matrix', 'Merge-Matrix-Brett', 'Plateau de Merge Matrix', 'Tabuleiro de Merge Matrix', 'Tabellone di Merge Matrix'],
    ['Undo', 'Deshacer', 'Rückgängig', 'Annuler', 'Desfazer', 'Annulla'],
    ['Hint', 'Pista', 'Tipp', 'Indice', 'Dica', 'Aiuto'],
    ['Restart', 'Reiniciar', 'Neustart', 'Recommencer', 'Reiniciar', 'Ricomincia'],
    ['Leave', 'Salir', 'Verlassen', 'Quitter', 'Sair', 'Esci'],
    ['Leaderboard', 'Clasificación', 'Bestenliste', 'Classement', 'Ranking', 'Classifica'],
    ['Personal best: {n}', 'Récord personal: {n}', 'Persönlicher Rekord: {n}', 'Record personnel : {n}', 'Recorde pessoal: {n}', 'Record personale: {n}'],
    ['(global leaderboard unavailable — local records only)', '(clasificación global no disponible: solo récords locales)', '(globale Bestenliste nicht verfügbar – nur lokale Rekorde)', '(classement mondial indisponible — records locaux uniquement)', '(ranking global indisponível — só recordes locais)', '(classifica globale non disponibile: solo record locali)'],
    ['Go', 'Ya', 'Los', 'Partez', 'Já', 'Via'],
    ['up', 'arriba', 'nach oben', 'vers le haut', 'para cima', 'in alto'],
    ['down', 'abajo', 'nach unten', 'vers le bas', 'para baixo', 'in basso'],
    ['left', 'izquierda', 'nach links', 'à gauche', 'para a esquerda', 'a sinistra'],
    ['right', 'derecha', 'nach rechts', 'à droite', 'para a direita', 'a destra'],
    ['Nothing slides {dir} — try another direction.', 'Nada se desliza hacia {dir}: prueba otra dirección.', 'Nichts rutscht {dir} – versuch eine andere Richtung.', 'Rien ne glisse {dir} — essayez une autre direction.', 'Nada desliza {dir} — tente outra direção.', 'Niente scorre {dir}: prova un’altra direzione.'],
    ['Moved {dir}. Score {score}. {summary}', 'Movido hacia {dir}. Puntos {score}. {summary}', 'Nach {dir} geschoben. Punkte {score}. {summary}', 'Déplacé {dir}. Score {score}. {summary}', 'Movido {dir}. Pontos {score}. {summary}', 'Spostato {dir}. Punti {score}. {summary}'],
    ['Undid the last move.', 'Se deshizo el último movimiento.', 'Letzter Zug rückgängig gemacht.', 'Dernier coup annulé.', 'Última jogada desfeita.', 'Ultima mossa annullata.'],
    ['Undo is not available in this mode.', 'Deshacer no está disponible en este modo.', 'Rückgängig ist in diesem Modus nicht verfügbar.', 'L’annulation n’est pas disponible dans ce mode.', 'Desfazer não está disponível neste modo.', 'Annulla non è disponibile in questa modalità.'],
    ['Cannot undo now.', 'No se puede deshacer ahora.', 'Rückgängig ist gerade nicht möglich.', 'Impossible d’annuler maintenant.', 'Não é possível desfazer agora.', 'Impossibile annullare ora.'],
    ['Try {dir} — {why}.', 'Prueba {dir}: {why}.', 'Versuch {dir} – {why}.', 'Essayez {dir} — {why}.', 'Tente {dir} — {why}.', 'Prova {dir}: {why}.'],
    ['No legal moves remain.', 'No quedan movimientos válidos.', 'Keine gültigen Züge mehr.', 'Plus aucun coup possible.', 'Não restam jogadas válidas.', 'Non restano mosse valide.'],
    ['only legal direction', 'única dirección válida', 'einzige mögliche Richtung', 'seule direction possible', 'única direção válida', 'unica direzione valida'],
    ['frees {n} cells with the best immediate merges', 'deja {n} celdas libres con las mejores uniones inmediatas', 'macht {n} Felder frei mit den besten direkten Verschmelzungen', 'libère {n} cases avec les meilleures fusions immédiates', 'libera {n} casas com as melhores junções imediatas', 'libera {n} celle con le migliori unioni immediate'],
    ['3D unavailable — using the accessible board view.', '3D no disponible: se usa la vista accesible del tablero.', '3D nicht verfügbar – barrierefreie Brettansicht wird verwendet.', '3D indisponible — vue accessible du plateau utilisée.', '3D indisponível — usando a visualização acessível do tabuleiro.', '3D non disponibile: uso la vista accessibile del tabellone.'],
    ['empty, row {r} column {c}', 'vacía, fila {r} columna {c}', 'leer, Zeile {r} Spalte {c}', 'vide, ligne {r} colonne {c}', 'vazia, linha {r} coluna {c}', 'vuota, riga {r} colonna {c}'],
    ['{v}, row {r} column {c}', '{v}, fila {r} columna {c}', '{v}, Zeile {r} Spalte {c}', '{v}, ligne {r} colonne {c}', '{v}, linha {r} coluna {c}', '{v}, riga {r} colonna {c}'],
    ['{size}×{size} board, {empty} empty cells, tiles: {tiles}. Largest {max}.', 'Tablero de {size}×{size}, {empty} celdas vacías, bloques: {tiles}. Mayor {max}.', '{size}×{size}-Brett, {empty} freie Felder, Blöcke: {tiles}. Größter {max}.', 'Plateau {size}×{size}, {empty} cases vides, tuiles : {tiles}. Plus grande {max}.', 'Tabuleiro {size}×{size}, {empty} casas vazias, blocos: {tiles}. Maior {max}.', 'Tabellone {size}×{size}, {empty} celle vuote, blocchi: {tiles}. Il più grande {max}.'],

    // ---- results
    ['Results', 'Resultados', 'Ergebnisse', 'Résultats', 'Resultados', 'Risultati'],
    ['Score breakdown', 'Desglose de la puntuación', 'Punkteaufschlüsselung', 'Détail du score', 'Detalhes da pontuação', 'Dettaglio del punteggio'],
    ['Merge points', 'Puntos por uniones', 'Verschmelzungspunkte', 'Points de fusion', 'Pontos de junção', 'Punti unione'],
    ['Milestone bonus', 'Bonificación de hito', 'Meilensteinbonus', 'Bonus d’étape', 'Bônus de marco', 'Bonus traguardo'],
    ['Efficiency bonus', 'Bonificación de eficiencia', 'Effizienzbonus', 'Bonus d’efficacité', 'Bônus de eficiência', 'Bonus efficienza'],
    ['Total', 'Total', 'Gesamt', 'Total', 'Total', 'Totale'],
    ['Retry', 'Reintentar', 'Nochmal', 'Réessayer', 'Tentar de novo', 'Riprova'],
    ['Next stage', 'Siguiente etapa', 'Nächste Etappe', 'Étape suivante', 'Próxima etapa', 'Tappa successiva'],
    ['Next lesson', 'Siguiente lección', 'Nächste Lektion', 'Leçon suivante', 'Próxima lição', 'Lezione successiva'],
    ['Menu', 'Menú', 'Menü', 'Menu', 'Menu', 'Menu'],
    ['Lesson complete', 'Lección completada', 'Lektion geschafft', 'Leçon terminée', 'Lição concluída', 'Lezione completata'],
    ['Milestone reached — {n}!', '¡Hito alcanzado: {n}!', 'Meilenstein erreicht – {n}!', 'Étape atteinte — {n} !', 'Marco alcançado — {n}!', 'Traguardo raggiunto: {n}!'],
    ['Out of moves', 'Sin movimientos', 'Keine Züge mehr', 'Plus de coups', 'Sem jogadas', 'Mosse esaurite'],
    ['Time expired', 'Se acabó el tiempo', 'Zeit abgelaufen', 'Temps écoulé', 'Tempo esgotado', 'Tempo scaduto'],
    ['Matrix full — run over', 'Matriz llena: fin de la partida', 'Matrix voll – Lauf vorbei', 'Matrice pleine — partie terminée', 'Matriz cheia — fim da partida', 'Matrice piena: partita finita'],
    ['{moves} moves · {invalid} invalid attempts · largest block {max} · seed {seed} · replay hash {hash}', '{moves} movimientos · {invalid} intentos no válidos · bloque mayor {max} · semilla {seed} · hash de repetición {hash}', '{moves} Züge · {invalid} ungültige Versuche · größter Block {max} · Seed {seed} · Replay-Hash {hash}', '{moves} coups · {invalid} tentatives invalides · plus grand bloc {max} · graine {seed} · empreinte de rejeu {hash}', '{moves} jogadas · {invalid} tentativas inválidas · maior bloco {max} · semente {seed} · hash do replay {hash}', '{moves} mosse · {invalid} tentativi non validi · blocco più grande {max} · seme {seed} · hash del replay {hash}'],
    ['Achievement unlocked: {names}', 'Logro desbloqueado: {names}', 'Erfolg freigeschaltet: {names}', 'Succès débloqué : {names}', 'Conquista desbloqueada: {names}', 'Obiettivo sbloccato: {names}'],
    ['New personal best for this board.', 'Nuevo récord personal en este tablero.', 'Neuer persönlicher Rekord auf diesem Brett.', 'Nouveau record personnel sur ce plateau.', 'Novo recorde pessoal neste tabuleiro.', 'Nuovo record personale su questo tabellone.'],
    ['Personal best here: {n}.', 'Récord personal aquí: {n}.', 'Persönlicher Rekord hier: {n}.', 'Record personnel ici : {n}.', 'Recorde pessoal aqui: {n}.', 'Record personale qui: {n}.'],
    ['{headline}. Total score {total}.', '{headline}. Puntuación total: {total}.', '{headline}. Gesamtpunktzahl {total}.', '{headline}. Score total : {total}.', '{headline}. Pontuação total: {total}.', '{headline}. Punteggio totale {total}.'],
    ['Daily score kept as your personal best and synced to your account.', 'Puntuación diaria guardada como récord personal y sincronizada con tu cuenta.', 'Tagespunktzahl als persönlicher Rekord gespeichert und mit deinem Konto synchronisiert.', 'Score du jour conservé comme record personnel et synchronisé avec votre compte.', 'Pontuação diária salva como recorde pessoal e sincronizada com sua conta.', 'Punteggio del giorno salvato come record personale e sincronizzato con il tuo account.'],
    ['Daily score stored locally as your personal best.', 'Puntuación diaria guardada localmente como récord personal.', 'Tagespunktzahl lokal als persönlicher Rekord gespeichert.', 'Score du jour enregistré localement comme record personnel.', 'Pontuação diária salva localmente como recorde pessoal.', 'Punteggio del giorno salvato in locale come record personale.'],

    // ---- help
    ['Slide', 'Deslizar', 'Schieben', 'Glisser', 'Deslizar', 'Scorri'],
    ['Arrow keys, WASD, swipe, or the on-board drag. Every block slides until it hits the edge or another block.', 'Flechas, WASD, deslizar o arrastrar sobre el tablero. Cada bloque se desliza hasta chocar con el borde u otro bloque.', 'Pfeiltasten, WASD, Wischen oder Ziehen auf dem Brett. Jeder Block rutscht, bis er an den Rand oder einen anderen Block stößt.', 'Flèches, WASD, balayage ou glisser sur le plateau. Chaque bloc glisse jusqu’au bord ou jusqu’à un autre bloc.', 'Setas, WASD, deslizar ou arrastar no tabuleiro. Cada bloco desliza até bater na borda ou em outro bloco.', 'Frecce, WASD, scorrimento o trascinamento sul tabellone. Ogni blocco scorre finché non tocca il bordo o un altro blocco.'],
    ['Merge', 'Unir', 'Verschmelzen', 'Fusionner', 'Juntar', 'Unisci'],
    ['Two blocks with the same number that collide combine into one of double value. Each block merges at most once per move.', 'Dos bloques con el mismo número que chocan se combinan en uno del doble de valor. Cada bloque se une como máximo una vez por movimiento.', 'Zwei Blöcke mit gleicher Zahl verschmelzen beim Zusammenstoß zu einem mit doppeltem Wert. Jeder Block verschmilzt höchstens einmal pro Zug.', 'Deux blocs de même nombre qui se rencontrent fusionnent en un bloc de valeur double. Chaque bloc fusionne au plus une fois par coup.', 'Dois blocos com o mesmo número que se encontram viram um só com o dobro do valor. Cada bloco junta no máximo uma vez por jogada.', 'Due blocchi con lo stesso numero che si scontrano si uniscono in uno di valore doppio. Ogni blocco si unisce al massimo una volta per mossa.'],
    ['New blocks', 'Bloques nuevos', 'Neue Blöcke', 'Nouveaux blocs', 'Blocos novos', 'Nuovi blocchi'],
    ['After every valid move, a new 2 (90%) or 4 (10%) appears in a random empty cell, chosen by the run’s seed.', 'Tras cada movimiento válido aparece un 2 (90 %) o un 4 (10 %) en una celda vacía al azar, elegida por la semilla de la partida.', 'Nach jedem gültigen Zug erscheint eine 2 (90 %) oder 4 (10 %) in einem zufälligen freien Feld, bestimmt durch den Seed des Laufs.', 'Après chaque coup valide, un 2 (90 %) ou un 4 (10 %) apparaît dans une case vide au hasard, choisie par la graine de la partie.', 'Após cada jogada válida, um 2 (90%) ou 4 (10%) surge numa casa vazia aleatória, escolhida pela semente da partida.', 'Dopo ogni mossa valida compare un 2 (90%) o un 4 (10%) in una cella vuota a caso, scelta dal seme della partita.'],
    ['Scoring', 'Puntuación', 'Wertung', 'Score', 'Pontuação', 'Punteggio'],
    ['You score the value of every merge. Reaching the goal tile adds a milestone bonus; constrained modes add an efficiency bonus.', 'Sumas el valor de cada unión. Alcanzar el bloque meta da una bonificación de hito; los modos con restricciones dan una bonificación de eficiencia.', 'Jede Verschmelzung bringt ihren Wert als Punkte. Der Zielblock bringt einen Meilensteinbonus; Modi mit Auflagen einen Effizienzbonus.', 'Chaque fusion rapporte sa valeur. Atteindre la tuile objectif ajoute un bonus d’étape ; les modes contraints ajoutent un bonus d’efficacité.', 'Cada junção vale o seu valor. Alcançar o bloco meta dá um bônus de marco; os modos com restrições dão um bônus de eficiência.', 'Ogni unione vale il suo valore. Raggiungere il blocco obiettivo dà un bonus traguardo; le modalità vincolate un bonus efficienza.'],
    ['Losing', 'Perder', 'Verlieren', 'Défaite', 'Derrota', 'Sconfitta'],
    ['The run ends when no move changes the board — a full grid with no adjacent equals.', 'La partida termina cuando ningún movimiento cambia el tablero: cuadrícula llena sin iguales adyacentes.', 'Der Lauf endet, wenn kein Zug das Brett mehr verändert – volles Gitter ohne benachbarte gleiche Zahlen.', 'La partie se termine quand aucun coup ne change le plateau — grille pleine sans égaux adjacents.', 'A partida acaba quando nenhuma jogada muda o tabuleiro — grade cheia sem iguais vizinhos.', 'La partita finisce quando nessuna mossa cambia il tabellone: griglia piena senza uguali adiacenti.'],
    ['Controls', 'Controles', 'Steuerung', 'Commandes', 'Controles', 'Comandi'],
    ['{slide}: slide · {undo}: undo (where allowed) · {hint}: hint · {pause}: pause · swipe or drag on the board · every action also has a button.', '{slide}: deslizar · {undo}: deshacer (si se permite) · {hint}: pista · {pause}: pausa · desliza o arrastra en el tablero · cada acción tiene también un botón.', '{slide}: schieben · {undo}: rückgängig (wo erlaubt) · {hint}: Tipp · {pause}: Pause · wischen oder ziehen auf dem Brett · jede Aktion hat auch eine Schaltfläche.', '{slide} : glisser · {undo} : annuler (si permis) · {hint} : indice · {pause} : pause · balayez ou glissez sur le plateau · chaque action a aussi un bouton.', '{slide}: deslizar · {undo}: desfazer (quando permitido) · {hint}: dica · {pause}: pausa · deslize ou arraste no tabuleiro · toda ação também tem um botão.', '{slide}: scorri · {undo}: annulla (dove consentito) · {hint}: aiuto · {pause}: pausa · scorri o trascina sul tabellone · ogni azione ha anche un pulsante.'],
    ['Seeds & fairness', 'Semillas y equidad', 'Seeds & Fairness', 'Graines et équité', 'Sementes e justiça', 'Semi ed equità'],
    ['Practice and Journey seeds are fixed. The daily seed is shared per UTC day, so everyone plays the same board.', 'Las semillas de Práctica y Viaje son fijas. La semilla diaria se comparte por día UTC, así que todos juegan el mismo tablero.', 'Die Seeds von Übung und Reise sind fest. Der Tages-Seed gilt pro UTC-Tag für alle, also spielen alle dasselbe Brett.', 'Les graines d’Entraînement et de Voyage sont fixes. La graine du jour est partagée par jour UTC : tout le monde joue le même plateau.', 'As sementes de Prática e Jornada são fixas. A semente diária é a mesma por dia UTC, então todos jogam o mesmo tabuleiro.', 'I semi di Pratica e Viaggio sono fissi. Il seme del giorno è condiviso per giorno UTC, quindi tutti giocano lo stesso tabellone.'],

    // ---- pause / settings
    ['Paused', 'En pausa', 'Pausiert', 'En pause', 'Pausado', 'In pausa'],
    ['Resume', 'Reanudar', 'Fortsetzen', 'Reprendre', 'Continuar', 'Riprendi'],
    ['Close', 'Cerrar', 'Schließen', 'Fermer', 'Fechar', 'Chiudi'],
    ['Audio', 'Audio', 'Audio', 'Audio', 'Áudio', 'Audio'],
    ['Music', 'Música', 'Musik', 'Musique', 'Música', 'Musica'],
    ['Effects', 'Efectos', 'Effekte', 'Effets', 'Efeitos', 'Effetti'],
    ['Ambience', 'Ambiente', 'Umgebung', 'Ambiance', 'Ambiente', 'Ambiente'],
    ['Mute all', 'Silenciar todo', 'Alles stumm', 'Tout couper', 'Silenciar tudo', 'Silenzia tutto'],
    ['Captions for sounds', 'Subtítulos de sonidos', 'Untertitel für Geräusche', 'Sous-titres des sons', 'Legendas dos sons', 'Sottotitoli per i suoni'],
    ['Graphics', 'Gráficos', 'Grafik', 'Graphismes', 'Gráficos', 'Grafica'],
    ['Theme', 'Tema', 'Design', 'Thème', 'Tema', 'Tema'],
    ['3D board (WebGL)', 'Tablero 3D (WebGL)', '3D-Brett (WebGL)', 'Plateau 3D (WebGL)', 'Tabuleiro 3D (WebGL)', 'Tabellone 3D (WebGL)'],
    ['Accessibility & controls', 'Accesibilidad y controles', 'Barrierefreiheit & Steuerung', 'Accessibilité et commandes', 'Acessibilidade e controles', 'Accessibilità e comandi'],
    ['Reduced motion', 'Movimiento reducido', 'Weniger Bewegung', 'Animations réduites', 'Movimento reduzido', 'Movimento ridotto'],
    ['High contrast', 'Alto contraste', 'Hoher Kontrast', 'Contraste élevé', 'Alto contraste', 'Contrasto elevato'],
    ['Larger text', 'Texto más grande', 'Größerer Text', 'Texte plus grand', 'Texto maior', 'Testo più grande'],
    ['Left-handed action rail', 'Barra de acciones para zurdos', 'Aktionsleiste für Linkshänder', 'Barre d’actions pour gauchers', 'Barra de ações para canhotos', 'Barra azioni per mancini'],
    ['Haptics on touch', 'Vibración al tocar', 'Haptik bei Berührung', 'Vibrations au toucher', 'Vibração ao tocar', 'Vibrazione al tocco'],
    ['Replay tutorial', 'Repetir el tutorial', 'Anleitung wiederholen', 'Revoir le tutoriel', 'Repetir o tutorial', 'Ripeti il tutorial'],
    ['Restart run', 'Reiniciar partida', 'Lauf neu starten', 'Recommencer la partie', 'Reiniciar partida', 'Ricomincia la partita'],
    ['Leave run', 'Salir de la partida', 'Lauf verlassen', 'Quitter la partie', 'Sair da partida', 'Abbandona la partita'],

    // ---- content: themes, achievements (src/content.ts)
    ['Dark Matrix', 'Matriz oscura', 'Dunkle Matrix', 'Matrice sombre', 'Matriz escura', 'Matrice scura'],
    ['Ember Glass', 'Cristal de brasa', 'Glutglas', 'Verre de braise', 'Vidro de brasa', 'Vetro di brace'],
    ['Verdant Circuit', 'Circuito verde', 'Grüner Schaltkreis', 'Circuit verdoyant', 'Circuito verde', 'Circuito verde'],
    ['High Contrast', 'Alto contraste', 'Hoher Kontrast', 'Contraste élevé', 'Alto contraste', 'Contrasto elevato'],
    ['Light Paper', 'Papel claro', 'Helles Papier', 'Papier clair', 'Papel claro', 'Carta chiara'],
    ['First Light', 'Primera luz', 'Erstes Licht', 'Première lueur', 'Primeira luz', 'Prima luce'],
    ['Complete your first stage or reach your first goal tile.', 'Completa tu primera etapa o alcanza tu primer bloque meta.', 'Schließe deine erste Etappe ab oder erreiche deinen ersten Zielblock.', 'Terminez votre première étape ou atteignez votre première tuile objectif.', 'Conclua sua primeira etapa ou alcance seu primeiro bloco meta.', 'Completa la prima tappa o raggiungi il primo blocco obiettivo.'],
    ['Matrix Adept', 'Experto de la matriz', 'Matrix-Adept', 'Adepte de la matrice', 'Adepto da matriz', 'Adepto della matrice'],
    ['Complete a mastery stage in Journey.', 'Completa una etapa de maestría en Viaje.', 'Schließe eine Meisterschafts-Etappe in der Reise ab.', 'Terminez une étape de maîtrise en Voyage.', 'Conclua uma etapa de maestria na Jornada.', 'Completa una tappa di maestria nel Viaggio.'],
    ['Seven-Day Circuit', 'Circuito de siete días', 'Sieben-Tage-Kreislauf', 'Circuit de sept jours', 'Circuito de sete dias', 'Circuito di sette giorni'],
    ['Play the daily challenge on 7 different days.', 'Juega el desafío diario en 7 días distintos.', 'Spiele die Tagesherausforderung an 7 verschiedenen Tagen.', 'Jouez le défi du jour 7 jours différents.', 'Jogue o desafio diário em 7 dias diferentes.', 'Gioca la sfida del giorno in 7 giorni diversi.'],
    ['Deep Signal', 'Señal profunda', 'Tiefes Signal', 'Signal profond', 'Sinal profundo', 'Segnale profondo'],
    ['Create a 4096 tile in any mode.', 'Crea un bloque de 4096 en cualquier modo.', 'Erzeuge in einem beliebigen Modus einen 4096er-Block.', 'Créez une tuile 4096 dans n’importe quel mode.', 'Crie um bloco 4096 em qualquer modo.', 'Crea un blocco da 4096 in qualsiasi modalità.'],
    ['Long Haul', 'Larga distancia', 'Langstrecke', 'Long parcours', 'Longo percurso', 'Lunga corsa'],
    ['Complete 20 Journey stages. Any settings, any assists.', 'Completa 20 etapas del Viaje. Con cualquier ajuste y ayuda.', 'Schließe 20 Reise-Etappen ab. Beliebige Einstellungen und Hilfen.', 'Terminez 20 étapes du Voyage. Tous réglages et aides permis.', 'Conclua 20 etapas da Jornada. Qualquer configuração ou ajuda.', 'Completa 20 tappe del Viaggio. Qualsiasi impostazione e aiuto.'],

    // ---- sound captions (src/audio.ts)
    ['tick', 'tic', 'Tick', 'tic', 'tique', 'tic'],
    ['slide', 'deslizamiento', 'Schieben', 'glissement', 'deslize', 'scorrimento'],
    ['merge {value}', 'unión {value}', 'Verschmelzung {value}', 'fusion {value}', 'junção {value}', 'unione {value}'],
    ['blocked', 'bloqueado', 'blockiert', 'bloqué', 'bloqueado', 'bloccato'],
    ['milestone reached', 'hito alcanzado', 'Meilenstein erreicht', 'étape atteinte', 'marco alcançado', 'traguardo raggiunto'],
    ['run ended', 'partida terminada', 'Lauf beendet', 'partie terminée', 'partida encerrada', 'partita finita'],
    ['undo', 'deshacer', 'rückgängig', 'annulation', 'desfazer', 'annulla'],
    ['achievement unlocked', 'logro desbloqueado', 'Erfolg freigeschaltet', 'succès débloqué', 'conquista desbloqueada', 'obiettivo sbloccato'],
    ['countdown {n}', 'cuenta regresiva {n}', 'Countdown {n}', 'compte à rebours {n}', 'contagem {n}', 'conto alla rovescia {n}'],
    ['go', 'ya', 'los', 'partez', 'já', 'via'],
    ['hint', 'pista', 'Tipp', 'indice', 'dica', 'aiuto'],
    ['new personal best', 'nuevo récord personal', 'neuer persönlicher Rekord', 'nouveau record personnel', 'novo recorde pessoal', 'nuovo record personale']
  ];

  var COLS = ['es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT'];
  var T = { 'en-US': {} };
  COLS.forEach(function (loc) { T[loc] = {}; });
  ROWS.forEach(function (row) { COLS.forEach(function (loc, i) { T[loc][row[0]] = row[i + 1]; }); });

  // en-GB: the copy has no US-only spellings; it inherits en-US.
  T['en-GB'] = {};
  // es-ES: Spain Spanish wording.
  T['es-ES'] = {
    'Settings': 'Ajustes',
    'Undid the last move.': 'Se ha deshecho el último movimiento.',
    'Time expired': 'Se ha acabado el tiempo',
    'countdown {n}': 'cuenta atrás {n}'
  };
  // fr-CA: Canadian French (pointage for score).
  T['fr-CA'] = {
    'Score': 'Pointage',
    'Score chase': 'Course au pointage',
    'Score breakdown': 'Détail du pointage',
    'Scoring': 'Pointage',
    'Moved {dir}. Score {score}. {summary}': 'Déplacé {dir}. Pointage {score}. {summary}',
    '{headline}. Total score {total}.': '{headline}. Pointage total : {total}.',
    'Daily score kept as your personal best and synced to your account.': 'Pointage du jour conservé comme record personnel et synchronisé avec votre compte.',
    'Daily score stored locally as your personal best.': 'Pointage du jour enregistré localement comme record personnel.'
  };

  root.MM_STRINGS = T;
})(typeof self !== 'undefined' ? self : this);
