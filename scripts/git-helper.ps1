function gs {
  git status
}

function gl {
  git log --oneline --graph --decorate --all
}

function gcmsg {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Message
  )
  git add .
  git commit -m "$Message"
}
