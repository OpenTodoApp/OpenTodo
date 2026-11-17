package sync

// existingAuthored applies the rules every kind an account authors shares
// (comments, attachments, time entries) to a write on a stored item: an item in
// no scope the writer can see is refused, a field that names the item's parent or
// author may only repeat the stored value, and deleted_at is the author's, a
// project admin's or the owner's. done is false for any other field, which the
// kind decides itself. The verdicts are pinned by TestAuthoredRulesMatrix.
func (r *resolver) existingAuthored(op Op, scope, author string, fixed map[string]string) (reason string, done bool) {
	if scope == "" {
		return ReasonForbidden, true
	}
	if want, ok := fixed[op.Field]; ok {
		if idValue(op.Value) != want {
			return ReasonForbidden, true
		}
		return "", true
	}
	if op.Field == "deleted_at" {
		if role := r.acc.roleIn(scope); author != r.acc.userID && role != RoleOwner && role != RoleAdmin {
			return ReasonForbidden, true
		}
		return "", true
	}
	return "", false
}
