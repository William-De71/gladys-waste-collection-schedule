# Waste Collection Schedule

## Présentation

Cette intégration amène dans Gladys Assistant les dates de collecte des déchets de votre adresse : quand passent le tri sélectif, le verre ou les ordures ménagères, un rappel la veille au soir, et un widget de tableau de bord avec les prochaines collectes.

Les dates viennent de [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule), la bibliothèque bien connue des utilisateurs de Home Assistant : près de 1 000 sources, communes et organismes de collecte d’une trentaine de pays, applications (Abfall.IO, Recycle!, ReCollect…) et n’importe quel lien de calendrier ICS. La bibliothèque tourne telle quelle dans le conteneur de l’intégration.

Elle existe en deux variantes, qui partagent le même code et la même image :

- **Waste Collection Schedule** (celle-ci) : un appareil par calendrier de collecte, avec le nombre de jours avant la prochaine collecte de chaque type de déchet, utilisable en tuile, en graphique et en condition de scène ;
- **Waste Collection Calendar** : les collectes dans le calendrier de Gladys, un calendrier par source pour chaque utilisateur qui l’active (Gladys 5.2.0 ou plus récent).

Les deux variantes ont le widget, les déclencheurs et les actions de scène. Installez celle que vous préférez, ou les deux.

![Le widget « Prochaines collectes », avec un calendrier puis deux (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-waste-collection-schedule/main/docs/assets/widgets.fr.png)

**Transport : cloud.** Le conteneur interroge le site web ou l’API de votre source, depuis votre Gladys, toutes les 12 heures par défaut. Votre adresse (ou ce dont la source a besoin : une rue, un numéro, un lien de calendrier) est envoyée à cette source et à personne d’autre. Rien ne passe par un serveur de Gladys.

### Appareils et fonctionnalités

| Fonctionnalité                                | Valeur                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| Prochaine collecte (jours)                    | jours avant la prochaine collecte, tous types confondus : 0 aujourd’hui, 1 demain |
| Prochaine collecte                            | les types de déchets de cette collecte, en texte                                  |
| _&lt;type de déchet&gt;_ (jours), un par type | jours avant la prochaine collecte de ce type, -1 quand rien n’est prévu           |

Les noms des types de déchets sont ceux de la source (par exemple « Ordures ménagères », « Tri sélectif », « Verre »).

## Prérequis

- Gladys Assistant 5.1.1 ou plus récent (5.2.0 ou plus récent pour la variante calendrier).
- Votre Gladys accède à Internet.
- Une source pour votre adresse. Consultez la [liste des sources](https://github.com/mampfes/hacs_waste_collection_schedule#supported-service-providers), ou utilisez le bouton **Trouver une source** de la page de configuration. Pas de source pour votre commune ? La source **ics** lit n’importe quel lien de calendrier (`.ics`, `webcal://`) publié par votre mairie ou votre organisme de collecte.

## Configuration

### Trouver votre source et ses arguments

1. Ouvrez **Intégrations → Waste Collection Schedule → Configuration**.
2. En bas de la page, saisissez le nom de votre commune ou de votre organisme de collecte dans **Trouver une source**, puis lancez-le. La réponse liste les sources qui correspondent, avec la **source** à recopier, les **arguments** déjà connus et ceux à compléter, et la documentation de la source.
3. Lisez la documentation de la source : elle explique chaque argument (une rue, un numéro, un identifiant trouvé sur le site de l’organisme).

### Remplir un calendrier

| Champ     | Quoi écrire                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Nom       | un nom pour le calendrier, affiché dans l’appareil, le widget et les scènes (par exemple « Maison »)                                          |
| Source    | le nom de la source, par exemple `ics` ou `opendata_bordeauxmetropole_fr`                                                                     |
| Arguments | un objet JSON, par exemple `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`, ou des paires `clé=valeur` séparées par des points-virgules |

Exemples :

- un lien ICS : source `ics`, arguments `{"url": "https://example.org/collectes.ics"}` ;
- Bordeaux Métropole : source `opendata_bordeauxmetropole_fr`, arguments `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`.

Jusqu’à trois calendriers : une résidence secondaire, ou une deuxième source pour la même adresse (la commune pour la plupart des bacs et un lien ICS pour le verre). Enregistrez, puis appuyez sur **Tester les calendriers** : la réponse indique, pour chaque calendrier, combien de dates et quels types de déchets la source a renvoyés, ou ce qui ne va pas.

### Types de déchets, rappels et mises à jour

| Champ                              | Par défaut | Rôle                                                                                  |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| Renommer                           | vide       | paires `Original=Nouveau` séparées par des points-virgules : `Tri sélectif=Bac jaune` |
| Masquer                            | vide       | types à ignorer, séparés par des points-virgules : `Sapins de Noël; Encombrants`      |
| Rappel de la veille                | 19 h       | heure des déclencheurs « Collecte des déchets demain », ou Désactivé                  |
| Rappel du matin                    | 6 h        | heure du déclencheur « Collecte des déchets aujourd’hui », ou Désactivé               |
| Mettre à jour les dates toutes les | 12 heures  | fréquence d’interrogation des sources (6, 12 ou 24 heures)                            |
| Langue des noms d’appareils        | Anglais    | langue des noms des appareils et des fonctionnalités                                  |

Renommer et masquer s’appliquent à tous les calendriers. Un type renommé donne une nouvelle fonctionnalité : voir Dépannage.

## Utilisation

### Appareils

Ouvrez l’onglet **Découverte** : chaque calendrier y apparaît comme un appareil « Collecte des déchets _&lt;nom&gt;_ ». Ajoutez-le : ses valeurs se mettent à jour après chaque interrogation et à minuit. Placez les fonctionnalités sur un tableau de bord, affichez leur historique ou utilisez-les en condition de scène, par exemple « jours avant la collecte du verre égal à 1 ».

### Widget

Dans l’éditeur de tableau de bord, ajoutez le widget **Prochaines collectes** depuis la section Waste Collection Schedule. Il montre la prochaine collecte, les prochains jours de collecte avec un bac de la bonne couleur (jaune pour le tri, bleu pour le papier, vert pour le verre et les déchets verts, marron pour les biodéchets, gris pour les ordures ménagères), l’état de chaque calendrier et un bouton **Actualiser**. Réglages : le calendrier affiché (tous, ou un seul), le nombre de jours de collecte (3, 5 ou 8) et le bouton Actualiser.

### Déclencheurs de scène

| Déclencheur                        | Quand                                                        | Variables                                                  |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Collecte des déchets demain        | la veille d’un jour de collecte, à l’heure du rappel du soir | types de déchets, nombre de types, date, nom du calendrier |
| Type de déchet collecté demain     | au même moment, une fois par type (pour filtrer sur un type) | type de déchet, date, nom du calendrier                    |
| Collecte des déchets aujourd’hui   | le matin d’un jour de collecte, à l’heure du rappel du matin | types de déchets, nombre de types, date, nom du calendrier |
| Échec de mise à jour des collectes | une fois, quand une source commence à échouer                | nom du calendrier, source, erreur                          |

Chaque déclencheur peut être filtré sur un calendrier. Un rappel n’est envoyé qu’une fois, même si Gladys redémarre ; si Gladys était éteint à l’heure du rappel, il arrive jusqu’à 3 heures plus tard.

### Actions de scène

- **Lire la prochaine collecte** (éventuellement d’un type de déchet, par exemple « verre ») : trouvée, date, jours restants, types de déchets, nom du calendrier.
- **Mettre à jour les dates de collecte** : interroge les sources maintenant ; renvoie réussite, erreur, prochaine date, prochains types de déchets, jours avant la prochaine collecte.

### Exemples de scènes

- **Collecte des déchets demain** → envoyer un message « Demain : {{triggerEvent.data.waste_types}}, pensez à sortir les bacs ».
- **Type de déchet collecté demain**, type « Verre » → allumer la lumière de l’entrée en vert pendant 10 minutes.
- **Collecte des déchets aujourd’hui**, à 6 h → si la porte du garage est fermée, envoyer un message « Collecte ce matin ».

### Variante calendrier

Installez **Waste Collection Calendar**, configurez-la de la même façon, puis chaque utilisateur qui veut les collectes dans son calendrier l’active dans **Mes calendriers**. Chaque calendrier de collecte devient un calendrier Gladys avec un événement sur la journée par collecte et par type de déchet, de 35 jours en arrière à 400 jours devant. Un calendrier commence privé : activez **Partager avec le foyer** dans **Mes calendriers** pour le montrer à tout le foyer et l’utiliser dans les scènes, avec les déclencheurs calendrier de Gladys.

## Dépannage

- **Source inconnue** : vérifiez l’orthographe de la source (minuscules, tirets bas), telle que la donne **Trouver une source**.
- **Arguments invalides** : le message de **Tester les calendriers** nomme l’argument en cause et, quand la source les connaît, propose les bonnes valeurs (noms de rues, communes).
- **La source a échoué** ou **a mis trop de temps** : le site de la source est en panne ou a changé, ou il ne trouve plus votre adresse. L’intégration réessaie après 15 minutes, puis de moins en moins souvent, et garde entre-temps les dernières dates connues. Si cela dure, vérifiez si la source fonctionne dans Home Assistant : sinon, signalez-le à [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule/issues), la correction arrivera avec une mise à jour de l’intégration.
- **Dates fausses ou manquantes** : les dates sont celles de la source. Comparez avec le site de votre organisme de collecte, et signalez un écart en amont.
- **Une fonctionnalité a disparu ou est apparue après un renommage** : les fonctionnalités sont identifiées par le nom du type de déchet. Après un renommage (par vous ou par la source), supprimez l’appareil et ajoutez-le à nouveau depuis l’onglet **Découverte**.
- **Pas de rappel** : vérifiez les heures de rappel dans la configuration, et que la scène filtre sur le bon calendrier.
- **Journaux** : l’onglet **Journaux** de l’intégration. Pour plus de détails, ajoutez la variable d’environnement `DEBUG=gladys-integration-sdk`. Pour signaler un problème, ouvrez une [issue](https://github.com/William-De71/gladys-waste-collection-schedule/issues) avec les versions de Gladys et de l’intégration, la source et les journaux.
