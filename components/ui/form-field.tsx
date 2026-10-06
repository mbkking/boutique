import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  /** Identifiant du champ contrôlé, relié par `htmlFor`. */
  htmlFor: string;
  label: ReactNode;
  /** Texte d'aide. Relié au champ par `aria-describedby`. */
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Contenu du champ : l'élément contrôlé, `<input>`, `<select>` ou `<textarea>`. */
  children: ReactNode;
  className?: string;
}

/**
 * Enveloppe de champ de formulaire.
 *
 * Centralise le libellé, l'aide et l'erreur autour d'un champ : c'est ce qui
 * garantit que l'erreur est **réellement liée** au champ qu'elle concerne, et
 * pas seulement affichée à côté.
 *
 * La liaison se fait sur l'élément enfant lui-même, et non sur un conteneur.
 * Une version antérieure posait les identifiants dans des attributs `data-*` sur
 * une `div` englobante : `aria-describedby` sur une `div` ne décrit rien, et
 * l'erreur n'était donc jamais annoncée comme appartenant au champ. C'est
 * exactement le genre d'attribut qui semble fonctionner parce qu'il est
 * présent dans le DOM, alors qu'il n'a aucun effet.
 */
export function FormField({
  htmlFor,
  label,
  hint,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;

  // `aria-describedby` doit citer les deux identifiants : l'ordre « aide puis
  // erreur » est celui dans lequel le lecteur d'écran les lira.
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>

      {withFieldAria(children, {
        id: htmlFor,
        describedBy,
        invalid: Boolean(error),
        required: Boolean(required),
      })}

      {hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        // `role="alert"` fait annoncer l'erreur dès son apparition, sans
        // dépendre du déplacement du focus sur le champ.
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Recopie les attributs ARIA sur l'élément contrôlé.
 *
 * Le champ reste maître de son rendu : on lui ajoute uniquement ce qui lui
 * manque. Un `aria-describedby` déjà présent est conservé et complété plutôt que
 * remplacé — un contrôle peut avoir ses propres descriptions, et les écraser
 * rendrait le sien muet.
 */
function withFieldAria(
  children: ReactNode,
  options: { id: string; describedBy: string; invalid: boolean; required: boolean }
): ReactNode {
  // Un enfant qui n'est pas un élément (texte, fragment, conditionnel rendu
  // ailleurs) ne peut pas recevoir ces attributs : on le laisse intact plutôt
  // que de déclencher une erreur de rendu.
  if (!isValidElement(children)) return children;

  const element = children as ReactElement<Record<string, unknown>>;
  const props = element.props;

  const existing = typeof props["aria-describedby"] === "string" ? props["aria-describedby"] : "";
  const merged = [existing, options.describedBy].filter(Boolean).join(" ");

  return cloneElement(element, {
    // Le libellé doit pointer vers le contrôle. L'identifiant n'est posé que
    // si l'appelant ne l'a pas déjà choisi.
    id: props.id ?? options.id,
    "aria-describedby": merged || undefined,
    // `false` plutôt qu'un attribut absent : un contrôle explicitement valide
    // reste distinguishable d'un contrôle dont l'état n'a pas été évalué.
    "aria-invalid": options.invalid ? true : undefined,
    // L'astérisque est `aria-hidden`, donc invisible au lecteur d'écran. Sans
    // ce renvoi, l'obligation affichée ne serait annoncée par personne.
    "aria-required": options.required ? true : undefined,
  });
}