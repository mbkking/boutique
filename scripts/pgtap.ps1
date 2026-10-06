# Exécution des tests pgTAP sur un PostgreSQL jetable.
#
# Le conteneur `boutique-pgtap-db` est RÉUTILISÉ, jamais recréé : le
# résultat des tests doit être lisible dans un seul endroit. Aucune donnée
# distante n'est touchée, la base vit dans le conteneur.
#
# Prérequis : Docker Desktop démarré.
#
#   powershell -ExecutionPolicy Bypass -File scripts/pgtap.ps1

$ErrorActionPreference = "Stop"

$Root       = Split-Path -Parent $PSScriptRoot
$Container  = "boutique-pgtap-db"
$Image      = "boutique-pgtap:18"
$DbName     = "ecommerce_test"
$DbUser     = "postgres"
$DbPassword = "testpass"

# Port publié sur l'hôte. Le serveur écoute toujours sur 5432 à l'intérieur
# du conteneur : les deux ne doivent pas être confondus.
$HostPort   = 5433
$InnerPort  = 5432

function Say([string]$Message) {
    Write-Host $Message
}

function Say-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# `docker exec` renvoie le code de sortie de psql, mais PowerShell ne le
# remonte pas à travers un pipe. On capture la sortie et on teste le texte :
# psql n'écrit rien sur stdout quand tout se passe bien.
function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Sql,
        # `-Db` serait en conflit avec l'alias prédéfini de PowerShell pour
        # `-Debug` : l'appel échouerait sur un MetadataError avant même
        # d'exécuter quoi que ce soit.
        [string]$Database = $DbName
    )

    $result = $Sql | docker exec -i $Container psql -U $DbUser -d $Database -v ON_ERROR_STOP=1 -t -A 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "psql a échoué :`n$result"
    }
    return $result
}

function Invoke-PsqlFile {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        # Même raison que dans `Invoke-Psql` : `-Db` est un alias réservé.
        [string]$Database = $DbName
    )

    $full = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $full)) {
        throw "Fichier introuvable : $full"
    }

    Say "    $($RelativePath)"

    # `$ErrorActionPreference = 'Stop'` fait d'une ligne stderr une
    # exception, alors que `psql` y écrit ses `NOTICE` — un comportement
    # normal, pas une erreur. On neutralise donc ce mécanisme **pour cet
    # appel seulement**, et c'est le code de sortie de `psql` qui décide :
    #
    #   0              → succès, les NOTICE sont conservés et affichés
    #   non nul        → échec, avec le message PostgreSQL complet
    #
    # Les vraies erreurs ne sont pas masquées : elles arrivent sur stderr
    # avec un code de sortie non nul, et `ON_ERROR_STOP=1` garantit que la
    # première d'entre elles arrête le script.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        $output = Get-Content -LiteralPath $full -Raw |
            docker exec -i $Container psql -U $DbUser -d $Database -v ON_ERROR_STOP=1 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }

    $output | ForEach-Object { Write-Host $_ }

    if ($exitCode -ne 0) {
        throw "Échec de $RelativePath (code $exitCode) — le schéma est incomplet, les tests ne seraient pas concluants."
    }
}

# ---------------------------------------------------------------
# 0. Le démon Docker répond-il ?
# ---------------------------------------------------------------

Say-Step "Vérification du démon Docker"

docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw @"
Le démon Docker ne répond pas.

Démarrez Docker Desktop, puis relancez :
    Start-Process "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    powershell -ExecutionPolicy Bypass -File scripts/pgtap.ps1
"@
}
Say "    Docker $(docker info --format '{{.ServerVersion}}') opérationnel"

# ---------------------------------------------------------------
# 1. Image pgTAP
# ---------------------------------------------------------------

Say-Step "Image $Image"

$haveImage = docker images -q $Image 2>$null
if ($LASTEXITCODE -ne 0) { $haveImage = $null }

if (-not $haveImage) {
    Say "    Construction depuis Dockerfile.pgtap (compilation de pgtap, plusieurs minutes)…"
    docker build -f (Join-Path $Root "Dockerfile.pgtap") -t $Image $Root
    if ($LASTEXITCODE -ne 0) {
        throw "La construction de l'image a échoué."
    }
} else {
    Say "    Image déjà présente"
}

# ---------------------------------------------------------------
# 2. Conteneur
# ---------------------------------------------------------------
#
# Le conteneur validé `boutique-pgtap-db` est RÉUTILISÉ. Le script ne doit
# jamais en créer un second : deux bases jetables côte à côte rendraient
# ambigu le résultat des tests, et le premier conteneur servirait alors à
# rien.
#
# Il ne supprime pas non plus le conteneur existant : les fixtures des
# tests vivent dans une transaction annulée, mais un diagnostic sur une
# base conservation serait alors impossible. Pour repartir de zéro, c'est
# une décision explicite :
#
#     docker rm -f boutique-pgtap-db
#     docker run -d --name boutique-pgtap-db `
#         -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=testpass `
#         -e POSTGRES_DB=ecommerce_test -p 5433:5432 boutique-pgtap:18

Say-Step "Conteneur $Container"

$existing = docker ps -a -q -f "name=^/$Container$" 2>$null

if (-not $existing) {
    Say "    Création"
    docker run -d `
        --name $Container `
        -e "POSTGRES_USER=$DbUser" `
        -e "POSTGRES_PASSWORD=$DbPassword" `
        -e "POSTGRES_DB=$DbName" `
        -p "${HostPort}:${InnerPort}" `
        $Image | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Le conteneur n'a pas démarré."
    }
} else {
    $running = docker ps -q -f "name=^/$Container$" 2>$null
    if ($running) {
        Say "    Déjà présent et démarré — réutilisé"
    } else {
        Say "    Présent mais arrêté — démarrage"
        docker start $Container | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Le conteneur existant n'a pas pu être démarré."
        }
    }
}

# Le tout premier démarrage initialise le répertoire de données : c'est long.
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    docker exec $Container pg_isready -U $DbUser -d $DbName 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    docker logs --tail 40 $Container
    throw "PostgreSQL n'a pas accepté de connexion après 120 s."
}
Say "    PostgreSQL prêt"

# Le port publié n'a d'intérêt que pour une connexion depuis Windows ; tout
# le script parle au conteneur par `docker exec`. On vérifie malgré tout que
# la publication attendue est en place : un port différent passerait
# inaperçu jusqu'au premier psql lancé depuis l'hôte.
$ports = docker port $Container "${InnerPort}/tcp" 2>$null
if ($ports -and $ports -notmatch ":${HostPort}$") {
    Write-Warning "Le conteneur ne publie pas le port ${HostPort} (trouvé : $ports)."
    Write-Warning "Une connexion depuis Windows utilisera `-p ${HostPort}:${InnerPort}`."
}
Say "    Port hôte $HostPort -> conteneur $InnerPort"

# ---------------------------------------------------------------
# 3. Shim Supabase
# ---------------------------------------------------------------
#
# `auth.uid()`, `auth.users` et les rôles `anon`/`authenticated`/
# `service_role` n'existent que sur Supabase. Sans ce fichier, la
# migration 001 échoue sur sa première policy.

Say-Step "Shim Supabase (auth.uid, auth.users, rôles)"

Invoke-PsqlFile "supabase\tests\bootstrap.sql"

# ---------------------------------------------------------------
# 4. Migrations, dans l'ordre lexicographique
# ---------------------------------------------------------------
#
# Le conteneur étant réutilisé, il peut contenir déjà un schéma. Rejouer
# les migrations sur une base migrée échouerait à la première instruction
# (`CREATE TABLE IF NOT EXISTS` passe, mais les `CREATE POLICY` sans
# `DROP` et les `ALTER TABLE ... ADD CONSTRAINT` non). Mieux vaut le dire
# que rendre un échec trompeur.

Say-Step "Migrations"

# Un arrêt antérieur peut avoir laissé le schéma à moitié migré. La garde ne
# peut donc pas porter sur `public.coupons` seule, créée par la 006 : si elle
# est absente alors que d'autres tables existent, la reprise serait partielle
# et silencieuse — `CREATE TABLE IF NOT EXISTS` passerait, puis les policies de
# la 001 échoueraient sur un doublon. On détecte la moindre table métier.
$partialState = Invoke-Psql -Sql @"
SELECT count(*) FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
"@

if ([int]$partialState -ne 0) {
    $coupons = Invoke-Psql -Sql @"
SELECT count(*) FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'coupons';
"@

    if ([int]$coupons -ne 0) {
        throw "La base $DbName contient déjà le schéma complet. Les migrations ne doivent pas être rejouées."
    }

    Write-Host "    $partialState tables métier déjà présentes, mais pas `public.coupons` :"
    Write-Host "    une migration précédente s'est arrêtée en cours."
    Write-Host ""
    Write-Host "    Reprendre n'est pas fiable : certaines tables existent déjà et les"
    Write-Host "    `CREATE POLICY` sans `DROP` échoueraient sur un doublon."
    Show-ResetProcedure
    throw "Base $DbName dans un état partiel : reset requis avant de relancer."
}

# Le conteneur reste ; seule la base est remise à zéro. Cette procédure est
# proposée, jamais exécutée d herself : détruire doit rester une décision
# explicite.
function Show-ResetProcedure {
    Write-Host ""
    Write-Host "RESET de la seule base $DbName — le conteneur $Container est conservé :" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    docker exec $Container dropdb -U $DbUser --if-exists $DbName"
    Write-Host "    docker exec $Container createdb  -U $DbUser $DbName"
    Write-Host ""
}

$previous = ""
$applied = 0

Get-ChildItem -LiteralPath (Join-Path $Root "supabase\migrations") -Filter *.sql |
    Sort-Object Name |
    ForEach-Object {
        # Un tri lexicographique placerait 010 avant 009 : la migration 010
        # modifie des policies créées par 009 et échouerait sur une table
        # absente. On vérifie donc l'ordre numérique, pas l'ordre du nom.
        $stem = [regex]::Match($_.Name, '^(\d+)').Groups[1].Value
        if ($previous -and [int]$stem -lt [int]$previous) {
            throw "Ordre de migration incohérent : $($_.Name) après $previous"
        }
        $previous = $stem
        $applied++

        Invoke-PsqlFile ("supabase\migrations\" + $_.Name)
    }

Say "    $applied migrations appliquées"

# ---------------------------------------------------------------
# 5. Privilèges des rôles
# ---------------------------------------------------------------
#
# Sur Supabase, la plateforme accorde à `anon` et `authenticated` leurs
# droits sur les tables. Ce fichier rejoue cette partie du shim, une fois les
# tables créées. Doit précéder le seed et les tests : sans lui, les policies
# qui filtrent via `customers` ou `profiles` échouent sur un défaut de
# privilège au lieu d'être évaluées.

Say-Step "Privilèges anon / authenticated"

Invoke-PsqlFile "supabase\tests\privileges.sql"

# ---------------------------------------------------------------
# 6. Seed
# ---------------------------------------------------------------

Say-Step "Données de démonstration"

Invoke-PsqlFile "supabase\seed.sql"

# ---------------------------------------------------------------
# 6. pgTAP
# ---------------------------------------------------------------

Say-Step "Tests pgTAP"

# Même traitement que dans `Invoke-PsqlFile` : `psql` écrit ses `NOTICE` sur
# stderr, ce que `$ErrorActionPreference = 'Stop'` prendrait pour une erreur.
# Ici le code de sortie est lu de la même façon — c'est lui seul qui décide.
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

try {
    $output = Get-Content -LiteralPath (Join-Path $Root "supabase\tests\database.sql") -Raw |
        docker exec -i $Container psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 2>&1
    $testExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousPreference
}

$output | ForEach-Object { Write-Host $_ }

# pgTAP termine la transaction par un ROLLBACK : les fixtures des tests ne
# survivent pas. On peut donc interroger la base ensuite pour vérifier que
# rien n'a fui — c'est un contrôle, pas une assertion.
Say-Step "Contrôle : la base est-elle restée propre ?"

$leftovers = Invoke-Psql -Sql @"
SELECT count(*) FROM public.coupons WHERE code IN (
    'INCONNU99', 'INACTIF', 'AVENIR', 'EXPIRE', 'EPUISE',
    'MINIMUM', 'PLAFOND', 'POURCENT', 'CAT', 'PROD', 'CATPCT'
);
"@

if ([int]$leftovers -ne 0) {
    throw "$leftovers coupons de fixture subsistent : le ROLLBACK final n'a pas eu lieu."
}
Say "    Aucun coupon de fixture restant"

$promoLeftovers = Invoke-Psql -Sql @"
SELECT count(*) FROM public.promotions WHERE id::text LIKE 'bbbbbbbb-%';
"@

if ([int]$promoLeftovers -ne 0) {
    throw "$promoLeftovers promotions de fixture subsistent : le ROLLBACK final n'a pas eu lieu."
}
Say "    Aucune promotion de fixture restante"

# ---------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------

Write-Host ""
if ($testExit -eq 0) {
    Write-Host "RÉSULTAT : 110/110 assertions pgTAP passées." -ForegroundColor Green
    exit 0
}

Write-Host "RÉSULTAT : échec pgTAP. Le conteneur $Container est conservé pour inspection :" -ForegroundColor Red
Write-Host "    docker exec -it $Container psql -U $DbUser -d $DbName"
exit 1