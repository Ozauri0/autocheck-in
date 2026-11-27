package handlers

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"github.com/uct/autocheckin/backend/internal/auth"
	"github.com/uct/autocheckin/backend/internal/models"
)

const (
	minPassword = 4
	maxPassword = 72 // límite de bcrypt, en bytes
)

type userInput struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Password string `json:"password"`
}

// validate normaliza y valida; la contraseña solo es obligatoria al crear.
func (in *userInput) validate(creating bool) string {
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	switch {
	case !strings.Contains(in.Email, "@") || len(in.Email) > maxField:
		return "email inválido"
	case in.Name == "" || len(in.Name) > maxField:
		return "name es obligatorio (máximo 200 caracteres)"
	case in.Role != models.RoleAdmin && in.Role != models.RoleAyudante:
		return `role debe ser "admin" o "ayudante"`
	case (creating || in.Password != "") && utf8.RuneCountInString(in.Password) < minPassword:
		return "la contraseña debe tener al menos 4 caracteres"
	case len(in.Password) > maxPassword:
		return "la contraseña es demasiado larga (máximo 72 bytes)"
	}
	return ""
}

const (
	emailTaken = "ya existe un usuario con ese email"
	lastAdmin  = "debe quedar al menos un administrador"
)

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

// otherAdmins indica si queda algún admin además de id. Los documentos sin rol cuentan como admin.
func (s *Server) otherAdmins(r *http.Request, id bson.ObjectID) (bool, error) {
	n, err := s.store.Users.CountDocuments(r.Context(), bson.M{
		"_id":  bson.M{"$ne": id},
		"role": bson.M{"$in": bson.A{models.RoleAdmin, "", nil}},
	})
	return n > 0, err
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := findAll[models.User](r.Context(), s.store.Users, bson.M{},
		bson.D{{Key: "name", Value: 1}, {Key: "email", Value: 1}})
	if err != nil {
		fail(w, r, err)
		return
	}
	for i := range users {
		users[i].Normalize()
	}
	writeJSON(w, 200, users)
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	var in userInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(true); msg != "" {
		writeError(w, 400, msg)
		return
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		fail(w, r, err)
		return
	}
	u := models.User{
		ID: bson.NewObjectID(), Email: in.Email, Name: in.Name, Role: in.Role,
		PasswordHash: hash, CreatedAt: models.Now(),
	}
	_, err = s.store.Users.InsertOne(r.Context(), u)
	if mongo.IsDuplicateKeyError(err) {
		writeError(w, 409, emailTaken)
		return
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 201, u)
}

func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in userInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(false); msg != "" {
		writeError(w, 400, msg)
		return
	}
	set := bson.M{"email": in.Email, "name": in.Name, "role": in.Role}
	if in.Password != "" {
		hash, err := hashPassword(in.Password)
		if err != nil {
			fail(w, r, err)
			return
		}
		set["passwordHash"] = hash
	}

	s.users.Lock()
	defer s.users.Unlock()
	if in.Role != models.RoleAdmin {
		if id.Hex() == auth.UserID(r.Context()) {
			writeError(w, 409, "no puede quitarse el rol de administrador a sí mismo")
			return
		}
		ok, err := s.otherAdmins(r, id)
		if err != nil {
			fail(w, r, err)
			return
		}
		if !ok {
			writeError(w, 409, lastAdmin)
			return
		}
	}
	var u models.User
	err := s.store.Users.FindOneAndUpdate(r.Context(), bson.M{"_id": id}, bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&u)
	if mongo.IsDuplicateKeyError(err) {
		writeError(w, 409, emailTaken)
		return
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, u)
}

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if id.Hex() == auth.UserID(r.Context()) {
		writeError(w, 409, "no puede eliminar su propio usuario")
		return
	}
	s.users.Lock()
	defer s.users.Unlock()
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": id}).Err(); err != nil {
		fail(w, r, err)
		return
	}
	others, err := s.otherAdmins(r, id)
	if err != nil {
		fail(w, r, err)
		return
	}
	if !others {
		writeError(w, 409, lastAdmin)
		return
	}
	if _, err := s.store.Users.DeleteOne(r.Context(), bson.M{"_id": id}); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
