#!/bin/bash
# Enforcer hook para asegurar que solo se usen branches main y dev

ALLOWED_BRANCHES=("main" "dev")

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

# Por defecto, permitir
echo '{"continue": true}'
exit 0
