import { passwordRules } from '../utils/validation'

interface Props {
  password: string
  /** Username the password must not contain (own username, or the target's for admin reset). */
  username: string
}

export default function PasswordRulesChecklist({ password, username }: Props) {
  const rules = passwordRules(password, username)
  return (
    <ul className="password-rules" aria-label="Password rules">
      {rules.map((rule) => (
        <li key={rule.id} data-met={rule.passed} className={rule.passed ? 'rule-met' : 'rule-unmet'}>
          <span aria-hidden="true">{rule.passed ? '✓' : '○'}</span> {rule.label}
          <span className="visually-hidden">{rule.passed ? ' (met)' : ' (not met)'}</span>
        </li>
      ))}
    </ul>
  )
}
