# 3CX Modern Theme

Un thème pour le client web **3CX**, avec une présentation inspirée de Slack et quelques outils pour rendre les discussions plus pratiques.

## Ce que fait le thème

- Affiche les messages avec les noms et portraits des participants, dans une mise en page plus lisible.
- Propose un thème clair ou sombre, une couleur personnalisable et un alignement des messages au choix.
- Remplace le dernier indicateur de lecture par le portrait de l’interlocuteur dans les discussions individuelles.
- Préserve la transparence des aperçus PNG, WebP et GIF.
- Prépare les **avatars GIF animés** : image fixe pour les clients classiques, animation pour les utilisateurs du thème, si le serveur conserve les données du GIF.
- Ajoute des **favoris avec épingles et notes personnelles**, ainsi qu’une **galerie des images, documents et liens de la conversation ouverte**.
- Ajoute des emojis et sons de notification personnalisés, avec un panneau de réglages repliable.
- Alerte pour les nouveaux messages de la conversation ouverte lorsque 3CX n'a pas le focus, avec le son choisi et une notification du navigateur si elle est autorisée.
- Affiche les indicateurs de saisie dans les discussions individuelles et les groupes, même avec le panneau des participants fermé.

## Installation

1. Installe l’extension **[Tampermonkey](https://www.tampermonkey.net/)** dans ton navigateur.
2. Sur Chrome, active **« Autoriser les scripts utilisateurs »** dans les détails de l’extension Tampermonkey. Si nécessaire, consulte [l’aide officielle](https://www.tampermonkey.net/faq.php?q=Q209).
3. Clique sur **[Installer le thème](https://raw.githubusercontent.com/BriceWillus/3CX-modern-theme/main/3cx-slack-avatars.user.js)**, puis sur **Installer** dans la fenêtre Tampermonkey.
4. Ouvre **[3CX](https://decindustrie.3cx.no:5001/)**, ou recharge sa page si elle est déjà ouverte.

**Le CSS est chargé automatiquement : aucun fichier à copier et aucune extension Stylish/Stylus à installer.** Si tu utilisais une ancienne version du thème dans Stylish/Stylus, désactive cet ancien style.

Le dépôt est actuellement configuré pour l’instance `decindustrie.3cx.no:5001`. L’utilisation sur un autre serveur 3CX demande d’adapter les URL du thème et du script.

## Utilisation

Le petit panneau en haut donne accès aux réglages, aux favoris et à la galerie. La flèche permet de le replier.

Survole un message pour afficher son épingle. Dans les favoris, le bouton **note** ajoute une note personnelle ; clique sur une note existante pour la modifier. Cliquer sur le contenu d’une carte, dans les favoris ou la galerie, te ramène au message d’origine.

Les favoris et notes sont enregistrés **dans ce navigateur, pour le compte connecté**. La galerie se complète à mesure que tu remontes l’historique de la conversation.

Dans la galerie, les filtres **Tout**, **Images**, **Documents** et **Liens** permettent de retrouver le contenu partagé, avec une recherche par nom, URL ou auteur.

Dans **Tout** et **Liens**, le petit interrupteur **Liens Explorateur** permet aussi d’afficher les chemins réseau Windows (UNC), y compris les dossiers avec des espaces. Ce choix est mémorisé dans le navigateur. Un clic sur un chemin ramène au message d’origine.

## Notifications et saisie

Dans le menu **cloche**, choisis le son et active si besoin **Notification du navigateur**. Le navigateur demande son autorisation uniquement après un clic sur ce réglage. Si les notifications du site 3CX sont déjà autorisées, aucune nouvelle autorisation n'est nécessaire.

Pour la **conversation ouverte**, un nouveau message reçu déclenche l'alerte quand tu consultes un autre onglet ou une autre fenêtre. Lorsque tu regardes 3CX, ce message ne déclenche ni son ni notification supplémentaire. Tes propres envois et le chargement de l'historique restent silencieux. Un clic sur la notification ramène à la conversation correspondante. Le choix **Silencieux** coupe le son du thème sans désactiver les alertes visuelles du navigateur.

Dans les groupes, les portraits ou initiales des personnes en train d'écrire accompagnent les points animés. Le thème utilise les identités indiquées par 3CX ; si aucun nom n'est fourni, seuls les points apparaissent. Il ne remplace pas un prénom ambigu par le portrait d'un autre contact.

## Photo de profil animée

Avec la bêta 21 ou une version suivante, choisis ton GIF dans **Réglages → Général**, valide le recadrage puis enregistre ton profil. Un GIF déjà importé avant la bêta 20 doit être sélectionné à nouveau.

**Limite réelle de ce serveur : 100 Kio (102 400 octets) pour l'import de l'avatar.** C'est le PNG fixe et le GIF intégré qui doivent tenir dans cette limite, et non le GIF seul. Le thème limite le PNG final à **96 Kio**, avec une marge de 4 Kio, et contrôle sa taille après recadrage. Un import trop volumineux est bloqué avant l'envoi. La limite de 1 Mo indiquée en bêta 20 était trop élevée. Pour commencer, vise un GIF de **60 à 70 Kio** ; le poids exact disponible dépend de la première image PNG. Les limites de **1024 × 1024 pixels** et **600 images** restent applicables.

Le thème prépare un PNG fixe de la première image et y intègre le GIF original et le recadrage, sans hébergement externe. Les autres utilisateurs ayant le thème à jour retrouvent l'animation depuis cette même photo 3CX, sans configuration supplémentaire. Les clients classiques et mobiles continuent d'afficher le PNG fixe. Le réglage système « Réduire les animations » conserve aussi l'image fixe.

**Compatibilité serveur à vérifier au premier import :** un message confirme l'enregistrement animé après lecture de la photo renvoyée par 3CX. Si le serveur nettoie les données supplémentaires du PNG, un message indique que l'avatar est resté fixe. Dans ce cas, l'animation n'est pas partagée. Le résultat sur le serveur réel doit encore être validé ; le fonctionnement a été testé avec deux navigateurs indépendants et un serveur simulé.

## Mises à jour

- **Script JavaScript** : laisse les mises à jour automatiques activées dans Tampermonkey. Leur fréquence dépend de ses réglages. Recharge 3CX après une mise à jour du script.
- **CSS** : vérification à chaque chargement de 3CX, puis toutes les **30 minutes**, avec application directe.
- Un petit message indique lorsqu’une mise à jour a été appliquée.

Pour mettre à jour manuellement, rouvre le [lien d’installation](https://raw.githubusercontent.com/BriceWillus/3CX-modern-theme/main/3cx-slack-avatars.user.js), confirme la mise à jour dans Tampermonkey, puis recharge 3CX.

