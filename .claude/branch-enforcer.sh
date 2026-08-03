#!/bin/bash
# Enforcer hook para asegurar que solo se usen branches main y dev,
# y que los commits vayan siempre a nombre de daniel.krdns@gmail.com

ALLOWED_BRANCHES=("main" "dev")
ALLOWED_EMAIL="daniel.krdns@gmail.com"

# Leer el comando git del stdin
COMMAND=$(jq -r '.tool_input.command' 2>/dev/null)

if [ -z "$COMMAND" ]; then
  echo '{"continue": true}'
  exit 0
fi

# Funciones auxiliares
branch_is_allowed() {
  local branch="$1"
  # Remover refs/heads/ si está presente
  branch="${branch#refs/heads/}"

  for allowed in "${ALLOWED_BRANCHES[@]}"; do
    if [ "$branch" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

# Verificar si el comando intenta crear o pushear a una rama no permitida
if [[ "$COMMAND" =~ ^git\ (checkout|switch)\ -[bcB] ]]; then
  # Extractar el nombre de la rama
  BRANCH=$(echo "$COMMAND" | sed -E 's/git (checkout|switch) -[bcB] +([^ ]+).*/\2/')

  if ! branch_is_allowed "$BRANCH"; then
    echo "{\"continue\": false, \"stopReason\": \"Solo se permiten branches 'main' y 'dev'. Intento de crear: $BRANCH\"}"
    exit 1
  fi
fi

# Verificar push a branch específico
if [[ "$COMMAND" =~ ^git\ push.*-u ]]; then
  # Extractar branch del comando push
  BRANCH=$(echo "$COMMAND" | sed -E 's/.*-u origin ([^ ]+).*/\1/' | head -1)

  if [ -n "$BRANCH" ] && [ "$BRANCH" != "git" ]; then
    if ! branch_is_allowed "$BRANCH"; then
      echo "{\"continue\": false, \"stopReason\": \"Solo se permiten branches 'main' y 'dev'. Intento de pushear a: $BRANCH\"}"
      exit 1
    fi
  fi
fi

# Verificar cambios de branch
if [[ "$COMMAND" =~ ^git\ checkout\ [^-] ]] || [[ "$COMMAND" =~ ^git\ switch\ [^-] ]]; then
  BRANCH=$(echo "$COMMAND" | awk '{print $3}')

  if [ -n "$BRANCH" ]; then
    if ! branch_is_allowed "$BRANCH"; then
      echo "{\"continue\": false, \"stopReason\": \"Solo se permiten branches 'main' y 'dev'. Intento de cambiar a: $BRANCH\"}"
      exit 1
    fi
  fi
fi

# Bloquear intentos de reconfigurar user.email a otra cuenta
if [[ "$COMMAND" =~ ^git\ config(\ --global| --local)?\ user\.email\ (.+) ]]; then
  NEW_EMAIL=$(echo "$COMMAND" | sed -E 's/^git config( --global| --local)? user\.email +//' | tr -d '"'"'"'')

  if [ "$NEW_EMAIL" != "$ALLOWED_EMAIL" ]; then
    echo "{\"continue\": false, \"stopReason\": \"Los commits solo pueden ir a nombre de $ALLOWED_EMAIL. Intento de configurar: $NEW_EMAIL\"}"
    exit 1
  fi
fi

# Bloquear --author con otro email en un commit
if [[ "$COMMAND" =~ ^git\ commit ]] && [[ "$COMMAND" =~ --author=([^\ ]+) ]]; then
  AUTHOR_ARG="${BASH_REMATCH[1]}"

  if [[ "$AUTHOR_ARG" != *"$ALLOWED_EMAIL"* ]]; then
    echo "{\"continue\": false, \"stopReason\": \"Los commits solo pueden ir a nombre de $ALLOWED_EMAIL. --author no coincide: $AUTHOR_ARG\"}"
    exit 1
  fi
fi

# Bloquear -c user.email=<otro> embebido en el propio comando de commit
if [[ "$COMMAND" =~ -c\ user\.email=([^\ ]+) ]]; then
  INLINE_EMAIL="${BASH_REMATCH[1]}"

  if [ "$INLINE_EMAIL" != "$ALLOWED_EMAIL" ]; then
    echo "{\"continue\": false, \"stopReason\": \"Los commits solo pueden ir a nombre de $ALLOWED_EMAIL. -c user.email no coincide: $INLINE_EMAIL\"}"
    exit 1
  fi
fi

# Para cualquier commit, verificar que la config efectiva de git use la
# cuenta permitida (salvo que el propio comando ya la fije inline arriba).
if [[ "$COMMAND" =~ ^git\ commit ]] && ! [[ "$COMMAND" =~ -c\ user\.email= ]]; then
  CURRENT_EMAIL=$(git config user.email 2>/dev/null)

  if [ "$CURRENT_EMAIL" != "$ALLOWED_EMAIL" ]; then
    echo "{\"continue\": false, \"stopReason\": \"git config user.email es '$CURRENT_EMAIL', pero los commits solo pueden ir a nombre de $ALLOWED_EMAIL. Ejecuta 'git config user.email $ALLOWED_EMAIL' primero.\"}"
    exit 1
  fi
fi

# Por defecto, permitir
echo '{"continue": true}'
exit 0
